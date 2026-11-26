// Rigid-body flight model of the K-7: lift with stall, drag, prop thrust, fuel burn, damage and ground roll.
import * as THREE from 'three';

export const K7 = {
  mass: 1050,            // kg
  wingArea: 16.2,        // m^2
  cl0: 0.42, clAlpha: 5.0, stallDeg: 15,
  flapCl: [0, 0.28, 0.5], flapDrag: [0, 0.012, 0.035], flapStall: [0, 1.5, 3],
  cd0: 0.028, induced: 0.052, gearDrag: 0.011,
  thrust: 4300, propVmax: 108,   // N static, m/s where thrust fades out
  rates: { pitch: 1.2, roll: 1.7, yaw: 0.5 },
  trimAlpha: 0.075,      // angle of attack the tail holds hands-off: level flight near 70 kt
  vne: 88,               // never-exceed speed, m/s (171 kt)
  fuelCap: 120,          // litres
  fuelBurn: [0.012, 0.21],  // litres per second at idle and full power
};

const RHO = 1.225, G = 9.81;
const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _force = new THREE.Vector3(), _tmp = new THREE.Vector3();
const _qi = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _e = new THREE.Euler();

export const MS_TO_KT = 1.94384, M_TO_FT = 3.28084;

export class FlightModel {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.omega = new THREE.Vector3();   // body rates: x pitch-up, y yaw-left, z roll-left
    this.wind = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.throttle = 0; this.rpm = 0.2; this.flaps = 0; this.gearDown = true; this.brake = false;
    this.fuel = K7.fuelCap; this.damage = 0; this.engineOn = true;
    this.onGround = false; this.stall = false; this.alpha = 0; this.beta = 0; this.gLoad = 1;
    this.airspeed = 0; this.agl = 0; this.groundSpeed = 0; this.vs = 0;
    this.gust = 0; this.time = 0;
  }

  /** Places the aircraft at (x, y, z) pointing along heading (deg), pitched by pitchDeg, at speed m/s. */
  place(x, y, z, heading, speed, pitchDeg = 0) {
    this.pos.set(x, y, z);
    _e.set(THREE.MathUtils.degToRad(pitchDeg), -THREE.MathUtils.degToRad(heading), 0, 'YXZ');
    this.quat.setFromEuler(_e);
    this.forward(_f);
    this.vel.copy(_f).multiplyScalar(speed);
    this.omega.set(0, 0, 0);
    this.rpm = speed > 0 ? 0.75 : 0.2;
  }

  forward(out) { return out.set(0, 0, -1).applyQuaternion(this.quat); }
  up(out) { return out.set(0, 1, 0).applyQuaternion(this.quat); }
  right(out) { return out.set(1, 0, 0).applyQuaternion(this.quat); }

  /** Compass heading of the nose in degrees, 0..360. */
  get heading() {
    this.forward(_tmp);
    return (THREE.MathUtils.radToDeg(Math.atan2(_tmp.x, -_tmp.z)) + 360) % 360;
  }
  get pitchDeg() { this.forward(_tmp); return THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(_tmp.y, -1, 1))); }
  get bankDeg() {
    this.right(_r); this.up(_u);
    return THREE.MathUtils.radToDeg(Math.atan2(-_r.y, _u.y));
  }
  /** Angle of the flight path above the horizon. */
  get pathDeg() { const v = this.vel.length(); return v < 1 ? 0 : THREE.MathUtils.radToDeg(Math.asin(this.vel.y / v)); }

  /**
   * Advances the model by dt seconds.
   * env: { groundAt(x, z) -> { height, kind, slope, field } } ; returns a contact event or null.
   */
  step(dt, c, env) {
    this.time += dt;
    const k = K7;
    this.forward(_f); this.up(_u); this.right(_r);

    // engine
    const health = 1 - this.damage / 140;
    if (this.fuel <= 0) { this.fuel = 0; this.engineOn = false; }
    const thr = this.engineOn ? c.throttle : 0;
    this.throttle = c.throttle;
    const rpmTarget = this.engineOn ? 0.22 + 0.78 * thr : Math.min(0.35, this.airspeed / 120);
    this.rpm += (rpmTarget - this.rpm) * Math.min(1, dt * 1.6);
    if (this.engineOn) this.fuel -= (k.fuelBurn[0] + (k.fuelBurn[1] - k.fuelBurn[0]) * thr) * dt;

    // air-relative velocity in world and body frames, with a little gusting turbulence
    this.gust = Math.sin(this.time * 0.7) * Math.sin(this.time * 1.9 + 1) * this.wind.length() * 0.25;
    _va.copy(this.vel).sub(this.wind).addScaledVector(_r, this.gust * 0.5);
    const V = _va.length();
    this.airspeed = V;
    _qi.copy(this.quat).invert();
    _vb.copy(_va).applyQuaternion(_qi);
    this.alpha = V > 1 ? Math.atan2(-_vb.y, -_vb.z) : 0;
    this.beta = V > 1 ? Math.atan2(_vb.x, -_vb.z) : 0;
    const qdyn = 0.5 * RHO * V * V;

    // lift with a soft stall break
    const stallA = THREE.MathUtils.degToRad(k.stallDeg + k.flapStall[this.flaps]);
    const cl0 = k.cl0 + k.flapCl[this.flaps];
    let cl;
    const a = this.alpha;
    if (Math.abs(a) < stallA) { cl = cl0 + k.clAlpha * a; this.stall = false; }
    else {
      const peak = cl0 + k.clAlpha * stallA * Math.sign(a);
      cl = peak * Math.max(0.35, 1 - (Math.abs(a) - stallA) * 2.6);
      this.stall = V > 8 && !this.onGround;
    }
    // ground effect within a wingspan of the surface
    const ge = this.agl < 11 ? 1 + 0.22 * (1 - this.agl / 11) : 1;
    const lift = qdyn * k.wingArea * cl * ge * (1 - this.damage / 260);
    _force.set(0, 0, 0);
    if (V > 0.5) {
      _tmp.crossVectors(_r, _va).normalize();
      _force.addScaledVector(_tmp, lift);
      const cd = k.cd0 + k.induced * cl * cl + k.flapDrag[this.flaps] + (this.gearDown ? k.gearDrag : 0) + (this.stall ? 0.08 : 0) + this.damage * 0.0002;
      _force.addScaledVector(_va, -qdyn * k.wingArea * cd / V);
      // side force from the fuselage keeps the aircraft from skidding
      _force.addScaledVector(_r, -qdyn * k.wingArea * 0.5 * Math.sin(this.beta));
    }
    const thrust = thr * k.thrust * Math.max(0, 1 - V / k.propVmax) * health;
    _force.addScaledVector(_f, thrust);
    _force.y -= k.mass * G;
    this.gLoad = lift / (k.mass * G);

    // rotation: commanded rates, aerodynamic stability, damping
    const eff = THREE.MathUtils.clamp(qdyn / (0.5 * RHO * 48 * 48), 0.08, 1.35) * (1 - this.damage / 220);
    const R = k.rates;
    const tgt = _tmp.set(
      c.pitch * R.pitch * eff - (this.onGround ? a * 0.8 : (a - k.trimAlpha) * 3.0) * eff,
      -c.yaw * R.yaw * eff - this.beta * 2.4 * eff,
      -c.roll * R.roll * eff,
    );
    // dihedral: with the stick released the wings slowly roll back toward level
    if (Math.abs(c.roll) < 0.1 && !this.onGround) tgt.z += THREE.MathUtils.degToRad(this.bankDeg) * 0.45 * Math.min(1, eff);
    if (this.stall && V > 8) { tgt.x -= 0.5; tgt.z += Math.sin(this.time * 2.3) * 0.6; }
    this.omega.lerp(tgt, Math.min(1, dt * 4.5));

    // ground contact
    const ground = env.groundAt(this.pos.x, this.pos.z);
    const gearH = this.gearDown ? 1.7 : 0.75;
    this.agl = this.pos.y - ground.height - gearH;
    let event = null;
    if (this.agl <= 0.02) {
      if (!this.onGround) event = { type: 'touchdown', vs: this.vel.y, speed: V, bank: this.bankDeg, pitch: this.pitchDeg, ground, gearDown: this.gearDown, vel: this.vel.clone() };
      this.onGround = true;
    } else if (this.agl > 0.25) {
      if (this.onGround) event = { type: 'liftoff' };
      this.onGround = false;
    }

    // integrate
    this.vel.addScaledVector(_force, dt / k.mass);
    if (this.onGround) {
      const fwd = _tmp.set(_f.x, 0, _f.z).normalize();
      const along = this.vel.dot(fwd);
      const side = this.vel.x * -fwd.z + this.vel.z * fwd.x;
      const rough = ground.kind === 'runway' ? 1 : ground.kind === 'grass' ? 2.2 : 5;
      const decel = (0.02 * rough + (c.brake ? 0.55 : 0)) * G * dt;
      const nAlong = Math.sign(along) * Math.max(0, Math.abs(along) - decel);
      const nSide = side * Math.max(0, 1 - dt * 8);
      this.vel.x = fwd.x * nAlong + -fwd.z * nSide;
      this.vel.z = fwd.z * nAlong + fwd.x * nSide;
      if (this.agl < 0) { this.pos.y = ground.height + gearH; if (this.vel.y < 0) this.vel.y = 0; }
      // wheels hold the wings level; the nose wheel steers with rudder (and ailerons at taxi speed)
      const bank = THREE.MathUtils.degToRad(this.bankDeg), pitch = THREE.MathUtils.degToRad(this.pitchDeg);
      this.omega.z = bank * 4;
      if (pitch < -0.01) this.omega.x = Math.max(this.omega.x, -pitch * 6);
      if (pitch > 0.2) this.omega.x = Math.min(this.omega.x, -1);
      const steer = (c.yaw + c.roll * 0.6) * Math.min(1, Math.abs(along) / 6) * (Math.abs(along) < 25 ? 0.7 : 0.25);
      this.omega.y = -steer;
    }
    this.pos.addScaledVector(this.vel, dt);

    _dq.setFromEuler(_e.set(this.omega.x * dt, this.omega.y * dt, this.omega.z * dt, 'XYZ'));
    this.quat.multiply(_dq).normalize();

    // structural limits
    if (V > k.vne) this.damage = Math.min(100, this.damage + (V - k.vne) * 0.6 * dt);
    if (this.gLoad > 6) this.damage = Math.min(100, this.damage + (this.gLoad - 6) * 10 * dt);
    this.groundSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.vs = this.vel.y;
    this.flaps = c.flaps;
    if (c.gearDown !== this.gearDown && !(this.onGround && !c.gearDown)) this.gearDown = c.gearDown;
    return event;
  }
}
