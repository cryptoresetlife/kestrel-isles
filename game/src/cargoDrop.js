// Cargo drops: the marked drop zone, the sacks the Kestrel carries, their fall under a parachute and where they land.
import * as THREE from 'three';

const GRAVITY = 9.81;
const CHUTE_DELAY = 0.35;      // seconds of free fall before the canopy opens
const CHUTE_SINK = 8;          // m/s terminal sink rate under the canopy
const CHUTE_DRAG = 1.3;        // 1/s decay of the sack's speed over the ground once the canopy is open

/** Advances one sack by dt: free fall first, then the canopy slows it and the wind takes it. */
function stepSack(s, dt, wind) {
  s.age += dt;
  if (s.age < CHUTE_DELAY) {
    s.vel.y -= GRAVITY * dt;
  } else {
    const k = Math.exp(-CHUTE_DRAG * dt);
    s.vel.x = wind.x + (s.vel.x - wind.x) * k;
    s.vel.z = wind.z + (s.vel.z - wind.z) * k;
    s.vel.y += (-CHUTE_SINK - s.vel.y) * (1 - Math.exp(-2.5 * dt));
  }
  s.pos.addScaledVector(s.vel, dt);
}

export class CargoDrop {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.zone = null;
    this.sacks = [];
    this.left = 0;
    this.sackGeo = new THREE.BoxGeometry(1.1, 0.9, 1.1);
    this.sackMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
    this.strapMat = new THREE.MeshLambertMaterial({ color: 0xf2e6c8 });
    this.canopyGeo = new THREE.SphereGeometry(2.6, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    this.canopyMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a, side: THREE.DoubleSide, emissive: 0x3a1500 });
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xf4f4f4 });
  }

  /** Removes the zone and every sack, in the air or on the ground. */
  clear() {
    this.clearZone();
    for (const s of this.sacks) this.group.remove(s.mesh);
    this.sacks = [];
    this.left = 0;
  }

  clearZone() {
    if (this.zone) this.group.remove(this.zone.mesh);
    this.zone = null;
  }

  /** Marks a drop zone on the ground and loads the sacks: spec is {x, z, radius, name, cargo, sacks}. */
  setZone(spec, heightAt) {
    this.clearZone();
    const y = heightAt(spec.x, spec.z);
    const mesh = new THREE.Group();
    const paint = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const outer = new THREE.Mesh(new THREE.RingGeometry(spec.radius * 0.88, spec.radius, 48), paint);
    const inner = new THREE.Mesh(new THREE.RingGeometry(spec.radius * 0.28, spec.radius * 0.36, 32), paint);
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(spec.radius * 0.5, spec.radius * 0.09), paint);
    const cross2 = cross.clone(); cross2.rotation.z = Math.PI / 2;
    const flat = new THREE.Group();
    flat.add(outer, inner, cross, cross2);
    flat.rotation.x = -Math.PI / 2;
    flat.position.y = 1.2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 180, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 90;
    mesh.add(flat, beam);
    // flags on poles around the edge follow the ground, so the circle reads on a slope too
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.18, 7, 5), flagGeo = new THREE.PlaneGeometry(3.4, 2);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }), flagMat = new THREE.MeshBasicMaterial({ color: 0xff5a1a, side: THREE.DoubleSide });
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, px = Math.cos(a) * spec.radius, pz = Math.sin(a) * spec.radius;
      const gy = heightAt(spec.x + px, spec.z + pz) - y;
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(px, gy + 3.5, pz);
      const flag = new THREE.Mesh(flagGeo, flagMat); flag.position.set(px + 1.7, gy + 6, pz);
      mesh.add(pole, flag);
    }
    mesh.position.set(spec.x, y, spec.z);
    this.group.add(mesh);
    this.zone = { spec, mesh, beam, pos: new THREE.Vector3(spec.x, y, spec.z), radius: spec.radius };
    this.left = spec.sacks || 3;
  }

  get airborne() { return this.sacks.some((s) => !s.landed); }

  /** Releases one sack from under the aircraft; false when none are left. */
  release(fm) {
    if (this.left <= 0) return false;
    this.left--;
    const mesh = new THREE.Group();
    const sack = new THREE.Mesh(this.sackGeo, this.sackMat);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.2, 1.14), this.strapMat);
    const canopy = new THREE.Mesh(this.canopyGeo, this.canopyMat);
    canopy.position.y = 3.4;
    const pts = [];
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; pts.push(new THREE.Vector3(0, 0.45, 0), new THREE.Vector3(Math.cos(a) * 2.5, 3.5, Math.sin(a) * 2.5)); }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), this.lineMat);
    const chute = new THREE.Group();
    chute.add(canopy, lines);
    chute.scale.setScalar(0.01);
    mesh.add(sack, strap, chute);
    const pos = fm.pos.clone().add(new THREE.Vector3(0, -1.4, 0));
    mesh.position.copy(pos);
    this.group.add(mesh);
    this.sacks.push({ mesh, chute, pos, vel: fm.vel.clone(), age: 0, landed: false, rest: 0 });
    return true;
  }

  /** Where a sack released this instant would come down, flown through the same fall as a real one. */
  predictImpact(fm, groundAt) {
    const s = { pos: fm.pos.clone(), vel: fm.vel.clone(), age: 0 };
    s.pos.y -= 1.4;
    for (let i = 0; i < 600; i++) {
      stepSack(s, 0.05, fm.wind);
      const g = groundAt(s.pos.x, s.pos.z).height;
      if (s.pos.y <= g) { s.pos.y = g; break; }
    }
    return s.pos;
  }

  /** Moves the falling sacks; returns one {miss, hit, pos} for each that reached the ground this frame. */
  update(dt, time, wind, groundAt) {
    const landed = [];
    if (this.zone) this.zone.beam.material.opacity = 0.28 + Math.sin(time * 4) * 0.08;
    for (const s of this.sacks) {
      if (s.landed) {
        s.rest += dt;
        s.chute.scale.y = Math.max(0.12, s.chute.scale.y - dt * 1.5);
        continue;
      }
      stepSack(s, dt, wind);
      const open = THREE.MathUtils.clamp((s.age - CHUTE_DELAY) / 0.4, 0.01, 1);
      s.chute.scale.setScalar(open);
      s.mesh.rotation.z = Math.sin(time * 3 + s.age) * 0.12 * open;
      const g = groundAt(s.pos.x, s.pos.z);
      if (s.pos.y <= g.height + 0.45) {
        s.pos.y = g.height + 0.45;
        s.landed = true;
        s.mesh.rotation.z = 0;
        const miss = this.zone ? Math.hypot(s.pos.x - this.zone.pos.x, s.pos.z - this.zone.pos.z) : Infinity;
        landed.push({ miss, hit: !!this.zone && miss <= this.zone.radius, pos: s.pos.clone(), water: g.kind === 'water' });
      }
      s.mesh.position.copy(s.pos);
    }
    return landed;
  }
}
