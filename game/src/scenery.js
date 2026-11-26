// Forests, the harbour town, the lighthouse, boats and clouds that dress the islands.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { heightAt, rawHeight, WORLD_SIZE } from './terrain.js';
import { AIRFIELDS, flattenWeight } from './airfields.js';

function nearAirfield(x, z, pad = 0.02) {
  return AIRFIELDS.some((af) => flattenWeight(af, x, z) > pad);
}

function slopeAt(x, z) {
  const e = 8;
  return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
}

function buildForest(scene, rand) {
  const pine = new THREE.ConeGeometry(4.2, 13, 7);
  pine.translate(0, 9.5, 0);
  const trunk = new THREE.CylinderGeometry(0.6, 0.8, 4, 5);
  trunk.translate(0, 2, 0);
  const round = new THREE.IcosahedronGeometry(5, 0);
  round.translate(0, 7.5, 0);
  const pineMat = new THREE.MeshLambertMaterial({ color: 0x2e5a34 });
  const roundMat = new THREE.MeshLambertMaterial({ color: 0x4f8a3e, flatShading: true });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5b4130 });
  const N = 7000;
  const pines = new THREE.InstancedMesh(pine, pineMat, N);
  const rounds = new THREE.InstancedMesh(round, roundMat, N);
  const trunks = new THREE.InstancedMesh(trunk, trunkMat, N * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  let np = 0, nr = 0, nt = 0;
  for (let tries = 0; tries < 90000 && (np < N || nr < N); tries++) {
    const x = (rand() - 0.5) * WORLD_SIZE * 0.85, z = (rand() - 0.5) * WORLD_SIZE * 0.85;
    const h = heightAt(x, z);
    if (h < 7 || h > 520) continue;
    if (nearAirfield(x, z)) continue;
    if (slopeAt(x, z) > 0.7) continue;
    // clumped: keep trees where a low-frequency forest field is high
    const forest = Math.sin(x * 0.004 + Math.sin(z * 0.003) * 2) * Math.cos(z * 0.0037 - x * 0.001) + rand() * 0.6;
    if (forest < 0.25) continue;
    const scale = 0.7 + rand() * 0.8;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
    s.set(scale, scale * (0.85 + rand() * 0.4), scale);
    p.set(x, h - 0.5, z);
    m.compose(p, q, s);
    const usePine = h > 120 || rand() < 0.35;
    if (usePine && np < N) {
      pines.setMatrixAt(np, m); pines.setColorAt(np, col.setHSL(0.33 + rand() * 0.05, 0.4, 0.22 + rand() * 0.1)); np++;
    } else if (!usePine && nr < N) {
      rounds.setMatrixAt(nr, m); rounds.setColorAt(nr, col.setHSL(0.24 + rand() * 0.08, 0.45, 0.3 + rand() * 0.12)); nr++;
    } else continue;
    if (nt < N * 2) trunks.setMatrixAt(nt++, m);
  }
  pines.count = np; rounds.count = nr; trunks.count = nt;
  for (const im of [pines, rounds, trunks]) { im.castShadow = true; im.receiveShadow = false; scene.add(im); }
}

function buildTown(scene, rand) {
  // The harbour town sits on the lowland east of Harbor Field.
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const roofGeo = new THREE.ConeGeometry(0.75, 0.6, 4);
  roofGeo.rotateY(Math.PI / 4); roofGeo.translate(0, 1.3, 0);
  const N = 340;
  const walls = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
  const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const wallCols = [0xf3e9d8, 0xe7d3b3, 0xd9e3e6, 0xf0c9a7, 0xffffff, 0xc8d9c4];
  const roofCols = [0xb4502f, 0x8f3a2a, 0x4e6a8a, 0x6b4c3b, 0xc0623e];
  let n = 0;
  const centres = [{ x: 600, z: 2050, r: 420 }, { x: 3650, z: 3150, r: 160 }, { x: -3500, z: -2050, r: 200 }];
  for (const ctr of centres) {
    for (let tries = 0; tries < 1500 && n < N; tries++) {
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * ctr.r;
      const x = ctr.x + Math.cos(a) * rr, z = ctr.z + Math.sin(a) * rr;
      const h = heightAt(x, z);
      if (h < 3 || h > 80 || slopeAt(x, z) > 0.2 || nearAirfield(x, z, 0.3)) continue;
      const w = 8 + rand() * 8, d = 8 + rand() * 10, ht = 5 + rand() * 7;
      // houses snap to a street grid so the town reads as planned
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.round(rand() * 2) * Math.PI / 2 + 0.3);
      p.set(Math.round(x / 22) * 22, h - 0.3, Math.round(z / 22) * 22);
      s.set(w, ht, d);
      m.compose(p, q, s);
      walls.setMatrixAt(n, m); walls.setColorAt(n, c.set(wallCols[Math.floor(rand() * wallCols.length)]));
      s.set(w * 1.18, Math.max(w, d) * 0.55, d * 1.18);
      p.y = h - 0.3 + ht - 1.0 * s.y;
      m.compose(p, q, s);
      roofs.setMatrixAt(n, m); roofs.setColorAt(n, c.set(roofCols[Math.floor(rand() * roofCols.length)]));
      n++;
    }
  }
  walls.count = n; roofs.count = n;
  for (const im of [walls, roofs]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }
}

function buildLighthouse(scene) {
  const g = new THREE.Group();
  const x = 4250, z = 3350;
  const h = Math.max(4, heightAt(x, z));
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.4, 30, 16), new THREE.MeshLambertMaterial({ color: 0xf4f1ea }));
  tower.position.y = 15;
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.3 + 0.3 * (2 - i), 3.55 + 0.3 * (2 - i), 4, 16), new THREE.MeshLambertMaterial({ color: 0xc8322b }));
    band.position.y = 5 + i * 9;
    g.add(band);
  }
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3, 12), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
  lamp.position.y = 31.5;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3.2, 3, 12), new THREE.MeshLambertMaterial({ color: 0x2c2f33 }));
  cap.position.y = 34.5;
  g.add(tower, lamp, cap);
  g.position.set(x, h - 1, z);
  g.traverse((o) => { o.castShadow = true; });
  scene.add(g);
  return lamp;
}

function buildBoats(scene, rand) {
  const hull = new THREE.BoxGeometry(4, 2, 12);
  hull.translate(0, 0.6, 0);
  const cabin = new THREE.BoxGeometry(3, 2, 4);
  cabin.translate(0, 2.4, -1);
  const boats = [];
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2f2ee });
  const cabMat = new THREE.MeshLambertMaterial({ color: 0x2d6c8f });
  for (let i = 0; i < 26; i++) {
    let x, z;
    for (let k = 0; k < 40; k++) {
      x = (rand() - 0.5) * 9000; z = (rand() - 0.5) * 9000;
      const h = rawHeight(x, z);
      if (h < -8 && h > -36) break;
    }
    const b = new THREE.Group();
    b.add(new THREE.Mesh(hull, hullMat), new THREE.Mesh(cabin, cabMat));
    b.position.set(x, 0, z);
    b.rotation.y = rand() * Math.PI * 2;
    b.userData.phase = rand() * 10;
    scene.add(b);
    boats.push(b);
  }
  return boats;
}

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 30 + Math.random() * 68, y = 44 + Math.random() * 40, r = 14 + Math.random() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildClouds(scene, rand) {
  const tex = cloudTexture();
  const group = new THREE.Group();
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: true, transparent: true, opacity: 0.95 });
  for (let i = 0; i < 70; i++) {
    const cx = (rand() - 0.5) * 14000, cz = (rand() - 0.5) * 14000, cy = 850 + rand() * 650;
    const puffs = 4 + Math.floor(rand() * 5);
    for (let k = 0; k < puffs; k++) {
      const sp = new THREE.Sprite(mat);
      const s = 260 + rand() * 340;
      sp.scale.set(s * 1.6, s, 1);
      sp.position.set(cx + (rand() - 0.5) * 500, cy + (rand() - 0.5) * 80, cz + (rand() - 0.5) * 300);
      group.add(sp);
    }
  }
  scene.add(group);
  return { group, mat };
}

/** Places everything; returns the parts that animate or change with the time of day. */
export function buildScenery(scene, seed) {
  const rand = mulberry32(seed * 7 + 3);
  buildForest(scene, rand);
  buildTown(scene, rand);
  const lamp = buildLighthouse(scene);
  const boats = buildBoats(scene, rand);
  const clouds = buildClouds(scene, rand);
  return {
    clouds,
    update(t) {
      for (const b of boats) {
        b.position.y = Math.sin(t * 1.2 + b.userData.phase) * 0.25;
        b.rotation.z = Math.sin(t * 0.9 + b.userData.phase) * 0.04;
      }
      lamp.material.color.setHSL(0.14, 1, 0.75 + 0.2 * Math.sin(t * 3));
    },
    tintClouds(color) { clouds.mat.color.set(color); },
  };
}

