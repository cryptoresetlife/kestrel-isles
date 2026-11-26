// Particle effects: tyre smoke, dust, engine smoke, splashes, ring sparks and the crash fireball.
import * as THREE from 'three';

function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Effects {
  constructor(scene, max = 500) {
    this.scene = scene;
    this.tex = softTexture();
    this.pool = [];
    this.live = [];
    for (let i = 0; i < max; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: true });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      scene.add(s);
      this.pool.push({ s, vel: new THREE.Vector3(), life: 0, max: 1, size0: 1, size1: 1, c0: new THREE.Color(), c1: new THREE.Color(), a0: 1, drag: 0, lift: 0 });
    }
    this.debris = [];
    this.debrisGeo = new THREE.BoxGeometry(0.5, 0.12, 0.8);
  }

  emit(pos, o) {
    const p = this.pool.pop();
    if (!p) return;
    p.s.position.copy(pos);
    p.vel.copy(o.vel || new THREE.Vector3());
    p.life = 0; p.max = o.life || 1;
    p.size0 = o.size0 || 1; p.size1 = o.size1 || p.size0 * 3;
    p.c0.set(o.c0 ?? 0xffffff); p.c1.set(o.c1 ?? o.c0 ?? 0xffffff);
    p.a0 = o.alpha ?? 0.8; p.drag = o.drag ?? 0.5; p.lift = o.lift ?? 0;
    p.s.material.blending = o.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.s.visible = true;
    this.live.push(p);
  }

  /** White tyre smoke and a little dust when the wheels hit. */
  touchdown(pos, strength) {
    for (let i = 0; i < 10 + strength * 10; i++) {
      this.emit(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.3, (Math.random() - 0.5) * 3)), {
        vel: new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3),
        life: 1.2 + Math.random(), size0: 1.2, size1: 6 + strength * 4, c0: 0xf4f2ee, c1: 0xb9b3a6, alpha: 0.6,
      });
    }
  }

  /** A trail puff from a damaged or starved engine. */
  smoke(pos, vel, dark) {
    this.emit(pos, { vel: vel.clone().multiplyScalar(0.2).add(new THREE.Vector3(0, 1.5, 0)), life: 2.6, size0: 1.2, size1: 7, c0: dark ? 0x2b2b2b : 0x8a8a8a, c1: 0x5b5b5b, alpha: 0.55, drag: 1.2 });
  }

  splash(pos) {
    for (let i = 0; i < 40; i++) {
      this.emit(pos.clone(), { vel: new THREE.Vector3((Math.random() - 0.5) * 16, 6 + Math.random() * 14, (Math.random() - 0.5) * 16), life: 1.6, size0: 2, size1: 7, c0: 0xffffff, c1: 0xcfe9f2, alpha: 0.9, lift: -9.8, drag: 0.3 });
    }
  }

  sparks(pos, color) {
    for (let i = 0; i < 26; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(14 + Math.random() * 12);
      this.emit(pos.clone(), { vel: d, life: 0.9, size0: 2.2, size1: 0.4, c0: color, c1: 0xffffff, alpha: 1, additive: true, drag: 1.5 });
    }
  }

  /** Fireball, smoke column and tumbling debris. */
  explosion(pos, vel) {
    for (let i = 0; i < 70; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 16);
      this.emit(pos.clone(), { vel: d.add(vel.clone().multiplyScalar(0.15)), life: 0.8 + Math.random() * 0.8, size0: 3, size1: 12, c0: 0xffe28a, c1: 0xd2401b, alpha: 1, additive: true, drag: 2 });
    }
    for (let i = 0; i < 60; i++) {
      this.emit(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 6)), {
        vel: new THREE.Vector3((Math.random() - 0.5) * 3, 4 + Math.random() * 5, (Math.random() - 0.5) * 3), life: 4 + Math.random() * 3, size0: 4, size1: 22, c0: 0x3a3330, c1: 0x6d6964, alpha: 0.7, drag: 0.6,
      });
    }
    const mats = [0xf1ece0, 0xe8742a, 0x1d7f86, 0x23272c].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(this.debrisGeo, mats[i % mats.length]);
      m.position.copy(pos);
      m.scale.setScalar(0.6 + Math.random() * 1.8);
      this.scene.add(m);
      this.debris.push({ m, vel: new THREE.Vector3((Math.random() - 0.5) * 22, 6 + Math.random() * 14, (Math.random() - 0.5) * 22).add(vel.clone().multiplyScalar(0.3)), spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), life: 0 });
    }
    this.fireAt = pos.clone();
    this.fireTime = 9;
  }

  clear() {
    for (const p of this.live) { p.s.visible = false; this.pool.push(p); }
    this.live = [];
    for (const d of this.debris) this.scene.remove(d.m);
    this.debris = [];
    this.fireTime = 0;
  }

  update(dt, groundAt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) { p.s.visible = false; this.live.splice(i, 1); this.pool.push(p); continue; }
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.vel.y += p.lift * dt;
      p.s.position.addScaledVector(p.vel, dt);
      const sz = p.size0 + (p.size1 - p.size0) * t;
      p.s.scale.set(sz, sz, 1);
      p.s.material.color.copy(p.c0).lerp(p.c1, t);
      p.s.material.opacity = p.a0 * (1 - t) * Math.min(1, t * 8 + 0.2);
    }
    for (const d of this.debris) {
      d.life += dt;
      const gy = groundAt(d.m.position.x, d.m.position.z).height;
      if (d.m.position.y > gy + 0.2) {
        d.vel.y -= 9.8 * dt;
        d.m.position.addScaledVector(d.vel, dt);
        d.m.rotation.x += d.spin.x * dt; d.m.rotation.y += d.spin.y * dt; d.m.rotation.z += d.spin.z * dt;
      } else { d.m.position.y = gy + 0.2; d.vel.multiplyScalar(0.5); }
    }
    if (this.fireTime > 0) {
      this.fireTime -= dt;
      if (Math.random() < 0.7) this.emit(this.fireAt.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.5, (Math.random() - 0.5) * 3)), { vel: new THREE.Vector3(0, 5 + Math.random() * 3, 0), life: 1, size0: 2.5, size1: 6, c0: 0xffc861, c1: 0xb8321a, alpha: 0.9, additive: true, drag: 0.5 });
      if (Math.random() < 0.5) this.emit(this.fireAt.clone().add(new THREE.Vector3(0, 3, 0)), { vel: new THREE.Vector3((Math.random() - 0.5) * 2, 6, (Math.random() - 0.5) * 2), life: 5, size0: 4, size1: 26, c0: 0x2c2826, c1: 0x77736e, alpha: 0.6, drag: 0.2 });
    }
  }
}
