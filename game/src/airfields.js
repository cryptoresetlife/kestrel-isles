// The three airfields of the Kestrel Isles: where they lie, how they flatten the land, and their meshes.
import * as THREE from 'three';

/** Heading in degrees (0 = north = -Z, 90 = east = +X) to a unit direction on the ground plane. */
export function headingVector(deg) {
  const r = THREE.MathUtils.degToRad(deg);
  return { x: Math.sin(r), z: -Math.cos(r) };
}

export const AIRFIELDS = [
  { id: 'harbor', name: 'Harbor Field', short: 'HBR', x: -650, z: 1750, heading: 352, length: 1100, width: 32, elevation: 7 },
  { id: 'ridge', name: 'Ridge Strip', short: 'RDG', x: 1650, z: -1250, heading: 28, length: 640, width: 22, elevation: 0 },
  { id: 'light', name: 'Lighthouse Point', short: 'LHP', x: 3900, z: 2650, heading: 158, length: 760, width: 26, elevation: 14, blend: 700 },
];

export function airfieldById(id) { return AIRFIELDS.find((a) => a.id === id); }

/** Position of (x, z) in the runway's own frame: u along the landing heading, v to its right. */
export function runwayLocal(af, x, z) {
  const d = headingVector(af.heading);
  const dx = x - af.x, dz = z - af.z;
  return { u: dx * d.x + dz * d.z, v: dx * -d.z + dz * d.x };
}

/** World position of a point given in runway coordinates. */
export function runwayWorld(af, u, v) {
  const d = headingVector(af.heading);
  return { x: af.x + d.x * u - d.z * v, z: af.z + d.z * u + d.x * v };
}

/** 1 on the paved strip, 0 off it. */
export function onRunway(af, x, z, margin = 0) {
  const { u, v } = runwayLocal(af, x, z);
  return Math.abs(u) <= af.length / 2 + margin && Math.abs(v) <= af.width / 2 + margin;
}

/** Weight 0..1 for flattening the terrain around a field. */
export function flattenWeight(af, x, z) {
  const { u, v } = runwayLocal(af, x, z);
  const du = Math.max(0, Math.abs(u) - (af.length / 2 + 90));
  const dv = Math.max(0, Math.abs(v) - 85);
  const d = Math.hypot(du, dv);
  const t = Math.min(1, d / (af.blend || 260));
  return 1 - t * t * (3 - 2 * t);
}

function runwayTexture(af) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 2048;
  const g = c.getContext('2d');
  g.fillStyle = '#3b3f45'; g.fillRect(0, 0, c.width, c.height);
  // asphalt grain
  for (let i = 0; i < 9000; i++) {
    const s = 40 + Math.random() * 40;
    g.fillStyle = `rgba(${s},${s},${s + 4},0.35)`;
    g.fillRect(Math.random() * 128, Math.random() * 2048, 2, 2);
  }
  // tyre marks near both touchdown zones
  g.fillStyle = 'rgba(20,20,22,0.35)';
  for (let i = 0; i < 40; i++) {
    const y = 260 + Math.random() * 320;
    g.fillRect(48 + Math.random() * 30, y, 3, 30 + Math.random() * 90);
    g.fillRect(48 + Math.random() * 30, 2048 - y - 100, 3, 30 + Math.random() * 90);
  }
  g.fillStyle = '#e9e9e2';
  // edge lines
  g.fillRect(4, 0, 3, 2048); g.fillRect(121, 0, 3, 2048);
  // threshold piano keys, both ends
  for (let k = 0; k < 8; k++) {
    const x = 10 + k * 14.4;
    g.fillRect(x, 20, 8, 110); g.fillRect(x, 2048 - 130, 8, 110);
  }
  // centreline dashes
  for (let y = 330; y < 2048 - 330; y += 70) g.fillRect(62, y, 4, 36);
  // aiming point blocks
  g.fillRect(36, 380, 12, 80); g.fillRect(80, 380, 12, 80);
  g.fillRect(36, 2048 - 460, 12, 80); g.fillRect(80, 2048 - 460, 12, 80);
  // runway numbers (the landing direction is painted at the threshold you cross)
  const num = (h) => String(Math.round(h / 10) % 36 || 36).padStart(2, '0');
  g.font = 'bold 64px sans-serif'; g.textAlign = 'center';
  g.save(); g.translate(64, 2048 - 230); g.fillText(num(af.heading), 0, 0); g.restore();
  g.save(); g.translate(64, 230); g.rotate(Math.PI); g.fillText(num(af.heading + 180), 0, 0); g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Builds the runway, apron, hangar and approach lights for each field. */
export function buildAirfields(scene, heightAt) {
  const group = new THREE.Group();
  const lights = [];
  for (const af of AIRFIELDS) {
    const d = headingVector(af.heading);
    const yaw = Math.atan2(-d.x, -d.z);
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(af.width, af.length),
      new THREE.MeshLambertMaterial({ map: runwayTexture(af), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    strip.rotation.order = 'YXZ';
    strip.rotation.set(-Math.PI / 2, yaw, 0);
    strip.position.set(af.x, af.elevation + 0.08, af.z);
    strip.receiveShadow = true;
    group.add(strip);

    // apron and taxiway, a pale concrete slab beside the strip
    const apronPos = runwayWorld(af, -af.length * 0.18, af.width / 2 + 34);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(46, 130),
      new THREE.MeshLambertMaterial({ color: 0x8d8f88, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    apron.rotation.order = 'YXZ';
    apron.rotation.set(-Math.PI / 2, yaw, 0);
    apron.position.set(apronPos.x, af.elevation + 0.05, apronPos.z);
    apron.receiveShadow = true;
    group.add(apron);

    // hangar with a curved roof and a little tower
    const hangarPos = runwayWorld(af, -af.length * 0.18, af.width / 2 + 78);
    const hangar = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(34, 9, 26), new THREE.MeshLambertMaterial({ color: 0xc9b99a }));
    walls.position.y = 4.5;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 26, 16, 1, false, -Math.PI / 2, Math.PI),
      new THREE.MeshLambertMaterial({ color: 0x9c4a32 }));
    roof.rotation.x = Math.PI / 2; roof.rotation.z = Math.PI / 2; roof.scale.set(1, 1, 0.35); roof.position.y = 9;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(24, 8), new THREE.MeshLambertMaterial({ color: 0x2a2f36 }));
    door.position.set(0, 4, 13.05);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(5, 16, 5), new THREE.MeshLambertMaterial({ color: 0xe8e2d4 }));
    tower.position.set(-22, 8, 6);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 7), new THREE.MeshLambertMaterial({ color: 0x5fb3c9, emissive: 0x16323a }));
    cab.position.set(-22, 17.5, 6);
    hangar.add(walls, roof, door, tower, cab);
    hangar.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    hangar.position.set(hangarPos.x, af.elevation, hangarPos.z);
    hangar.rotation.y = yaw + Math.PI;
    group.add(hangar);

    // windsock
    const sockPos = runwayWorld(af, af.length * 0.3, -af.width / 2 - 25);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    pole.position.set(sockPos.x, af.elevation + 3.5, sockPos.z);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0xff6a1a, side: THREE.DoubleSide }));
    sock.rotation.z = Math.PI / 2; sock.position.set(sockPos.x + 2, af.elevation + 6.6, sockPos.z);
    group.add(pole, sock);
    af.windsock = sock;

    // edge and approach lights: small emissive posts that glow at dusk
    const lightGeo = new THREE.SphereGeometry(0.55, 6, 4);
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    const appMat = new THREE.MeshBasicMaterial({ color: 0xffd36b });
    const thrMat = new THREE.MeshBasicMaterial({ color: 0x5dff7a });
    const count = Math.floor(af.length / 60) + 1;
    for (let i = 0; i < count; i++) {
      const u = -af.length / 2 + i * (af.length / (count - 1));
      for (const side of [-1, 1]) {
        const p = runwayWorld(af, u, side * (af.width / 2 + 2));
        const m = new THREE.Mesh(lightGeo, edgeMat);
        m.position.set(p.x, af.elevation + 0.5, p.z);
        group.add(m); lights.push(m);
      }
    }
    for (let k = 1; k <= 6; k++) {
      for (const v of [-6, -3, 0, 3, 6]) {
        const p = runwayWorld(af, -af.length / 2 - k * 30, v);
        const m = new THREE.Mesh(lightGeo, appMat);
        m.position.set(p.x, Math.max(af.elevation, heightAt(p.x, p.z)) + 0.8, p.z);
        group.add(m); lights.push(m);
      }
    }
    for (let v = -af.width / 2; v <= af.width / 2; v += 4) {
      const p = runwayWorld(af, -af.length / 2 - 1, v);
      const m = new THREE.Mesh(lightGeo, thrMat);
      m.position.set(p.x, af.elevation + 0.4, p.z);
      group.add(m); lights.push(m);
    }
  }
  scene.add(group);
  return { group, lights };
}
