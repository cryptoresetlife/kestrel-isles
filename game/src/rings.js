// Glowing target rings: placement along a course, highlighting the next one, and detecting a fly-through.
import * as THREE from 'three';

const ACTIVE = new THREE.Color(0xffc23a), NEXT = new THREE.Color(0x56e0ff), DONE = new THREE.Color(0x46ff8c);

export class RingCourse {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rings = [];
    this.index = 0;
    this.torus = new THREE.TorusGeometry(1, 0.075, 10, 48);
    this.beamGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6, 1, true);
  }

  clear() {
    for (const r of this.rings) this.group.remove(r.mesh);
    this.rings = [];
    this.index = 0;
  }

  /**
   * points: [{x, y, z, radius, heading?}] in order; each ring faces the direction of travel, or its own
   * heading when it has one. `from` is where the aircraft comes from, for a course of a single ring.
   */
  build(points, from) {
    this.clear();
    points.forEach((p, i) => {
      const after = points[i + 1];
      const prev = points[i - 1] || (after ? { x: p.x - (after.x - p.x), y: p.y, z: p.z - (after.z - p.z) } : from ? { x: from.x, y: p.y, z: from.z } : { x: p.x, y: p.y, z: p.z + 1 });
      const next = points[i + 1] || { x: p.x + (p.x - prev.x), y: p.y, z: p.z + (p.z - prev.z) };
      const dir = new THREE.Vector3(next.x - prev.x, (next.y - prev.y) * 0.5, next.z - prev.z).normalize();
      if (p.heading !== undefined) dir.set(Math.sin(p.heading * Math.PI / 180), 0, -Math.cos(p.heading * Math.PI / 180));
      const mat = new THREE.MeshBasicMaterial({ color: NEXT, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
      const mesh = new THREE.Group();
      const ring = new THREE.Mesh(this.torus, mat);
      ring.scale.setScalar(p.radius);
      const halo = new THREE.Mesh(this.torus, new THREE.MeshBasicMaterial({ color: NEXT, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      halo.scale.set(p.radius * 1.04, p.radius * 1.04, p.radius * 3.5);
      mesh.add(ring, halo);
      // four chevrons pointing in to the centre
      for (let k = 0; k < 4; k++) {
        const chev = new THREE.Mesh(new THREE.ConeGeometry(p.radius * 0.09, p.radius * 0.22, 3), mat);
        const a = k * Math.PI / 2 + Math.PI / 4;
        chev.position.set(Math.cos(a) * p.radius * 0.8, Math.sin(a) * p.radius * 0.8, 0);
        chev.rotation.z = a + Math.PI / 2;
        mesh.add(chev);
      }
      mesh.position.set(p.x, p.y, p.z);
      mesh.lookAt(mesh.position.clone().add(dir));
      this.group.add(mesh);
      this.rings.push({ mesh, ring, halo, mat, pos: mesh.position.clone(), normal: dir, radius: p.radius, passed: false });
    });
    this.refresh();
  }

  get current() { return this.rings[this.index] || null; }
  get done() { return this.index >= this.rings.length; }

  refresh() {
    this.rings.forEach((r, i) => {
      const c = i < this.index ? DONE : i === this.index ? ACTIVE : NEXT;
      r.mat.color.copy(c); r.halo.material.color.copy(c);
      r.mat.opacity = i < this.index ? 0.25 : i === this.index ? 1 : i === this.index + 1 ? 0.75 : 0.35;
      r.halo.visible = i === this.index;
      r.mesh.visible = i >= this.index - 1;
    });
  }

  /**
   * Checks whether the segment from a to b passes through the current ring.
   * Returns 'pass', 'miss' (crossed the ring's plane outside it) or null.
   */
  check(a, b) {
    const r = this.current;
    if (!r) return null;
    const da = a.clone().sub(r.pos).dot(r.normal), db = b.clone().sub(r.pos).dot(r.normal);
    if (da < 0 && db >= 0) {
      const t = -da / (db - da);
      const hit = a.clone().lerp(b, t);
      const off = hit.distanceTo(r.pos);
      if (off <= r.radius * 1.05) { r.passed = true; this.index++; this.refresh(); return { result: 'pass', off, ring: r }; }
      if (off < r.radius * 4) return { result: 'miss', off, ring: r };
    }
    return null;
  }

  /** Lets the player skip a ring they missed by flying back through it later. */
  update(time) {
    const r = this.current;
    if (r) {
      const pulse = 1 + Math.sin(time * 5) * 0.04;
      r.ring.scale.setScalar(r.radius * pulse);
      r.mesh.rotation.z = 0;
    }
  }
}
