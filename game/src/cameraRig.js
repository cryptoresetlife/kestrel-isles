// Chase, cockpit and orbit cameras, each smoothed so it follows the pilot rather than fighting them.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'chase';
    this.frame = new THREE.Quaternion();
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.orbitAngle = 0;
    this.shake = 0;
    this.first = true;
  }

  setMode(mode) { this.mode = mode; this.first = true; }

  /** Instantly places the camera, used after a restart so it does not swoop in. */
  snap() { this.first = true; }

  update(dt, fm, cockpit, ground) {
    const cam = this.camera;
    if (this.mode === 'cockpit') {
      cam.near = 0.05; cam.fov = 72;
      _v.copy(cockpit.eye).applyQuaternion(fm.quat).add(fm.pos);
      cam.position.copy(_v);
      // look slightly into the turn, like a pilot does
      const lookYaw = THREE.MathUtils.degToRad(-fm.bankDeg) * 0.12;
      _q.setFromEuler(new THREE.Euler(-0.13, lookYaw, 0, 'YXZ'));
      cam.quaternion.copy(fm.quat).multiply(_q);
    } else if (this.mode === 'chase') {
      cam.near = 0.5; cam.fov = 62;
      // a frame that trails the aircraft's attitude, taking only part of its roll
      const k = this.first ? 1 : 1 - Math.exp(-dt * 3.2);
      this.frame.slerp(fm.quat, k);
      const speedPull = Math.min(1, fm.airspeed / 70);
      const dist = 15 + speedPull * 3, height = 4.8;
      _v.set(0, height, dist).applyQuaternion(this.frame);
      // keep the camera above the ground and level-ish in pitch so the horizon stays readable
      const target = _w.copy(fm.pos).add(_v);
      const gy = ground(target.x, target.z) + 2.5;
      if (target.y < gy) target.y = gy;
      if (this.first) this.pos.copy(target); else this.pos.lerp(target, 1 - Math.exp(-dt * 9));
      cam.position.copy(this.pos);
      _up.set(0, 1, 0).applyQuaternion(this.frame).lerp(new THREE.Vector3(0, 1, 0), 0.65).normalize();
      cam.up.copy(_up);
      this.look.copy(fm.pos).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(this.frame), 22).add(new THREE.Vector3(0, 1.2, 0));
      cam.lookAt(this.look);
    } else if (this.mode === 'orbit') {
      cam.near = 0.5; cam.fov = 55;
      this.orbitAngle += dt * 0.25;
      const r = this.orbitRadius || 28;
      const target = _w.set(fm.pos.x + Math.cos(this.orbitAngle) * r, fm.pos.y + (this.orbitHeight || 8), fm.pos.z + Math.sin(this.orbitAngle) * r);
      const gy = ground(target.x, target.z) + 3;
      if (target.y < gy) target.y = gy;
      if (this.first) this.pos.copy(target); else this.pos.lerp(target, 1 - Math.exp(-dt * 3));
      cam.position.copy(this.pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(fm.pos);
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
    }
    cam.updateProjectionMatrix();
    this.first = false;
  }
}
