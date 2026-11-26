// The islands' height field, its coloured mesh and the sea around it.
import * as THREE from 'three';
import { fbm, ridged, seedNoise, smoothstep, lerp, clamp, valueNoise } from './noise.js';
import { AIRFIELDS, flattenWeight, onRunway } from './airfields.js';

export const WORLD_SIZE = 12000;
export const SEA_LEVEL = 0;

const ISLANDS = [
  { x: 0, z: 0, rx: 3300, rz: 2900, lift: 1.0 },
  { x: 3900, z: 2650, rx: 900, rz: 1100, lift: 0.55 },
  { x: -3600, z: -2200, rx: 1100, rz: 900, lift: 0.7 },
  { x: -3900, z: 2900, rx: 600, rz: 500, lift: 0.45 },
  { x: 2600, z: -3600, rx: 700, rz: 650, lift: 0.6 },
];

function islandMask(x, z) {
  let m = 0;
  for (const is of ISLANDS) {
    const dx = (x - is.x) / is.rx, dz = (z - is.z) / is.rz;
    const d = Math.sqrt(dx * dx + dz * dz);
    m = Math.max(m, (1 - d) * is.lift);
  }
  return m;
}

/** Height of the land before the airfields are cut into it. */
export function rawHeight(x, z) {
  const warp = fbm(x * 0.00035 + 11.3, z * 0.00035 - 4.1, 3) * 600;
  const wx = x + warp, wz = z - warp;
  const coast = islandMask(wx, wz) + fbm(wx * 0.0009, wz * 0.0009, 4) * 0.15 - 0.02;
  if (coast < 0) return -40 + coast * 120;
  const land = smoothstep(0.0, 0.35, coast);
  // a north-running spine of mountains on the main island, with a valley cut through it
  const spine = ridged(wx * 0.00055 + 3.7, wz * 0.00055 + 1.9, 5);
  const northness = smoothstep(2400, -1600, z);
  const valley = 1 - 0.75 * Math.exp(-((x - 300 - z * 0.25) ** 2) / (2 * 260 ** 2)) * smoothstep(1400, 0, z) * smoothstep(-2600, -1000, z);
  // a lowland basin north of Harbor Field keeps the departure clear of the range
  const basin = smoothstep(500, 1700, Math.hypot(x + 700, (z - 1000) * 0.8));
  const mountains = Math.pow(spine, 1.45) * 980 * smoothstep(0.12, 0.55, coast) * (0.35 + 0.65 * northness) * valley * basin;
  const hills = (fbm(wx * 0.0016, wz * 0.0016, 5) * 0.5 + 0.5) * 120 * land;
  const beach = land * 6;
  return beach + hills * smoothstep(0.03, 0.25, coast) + mountains + coast * 40 - 4;
}

/** Height of the ground (or sea floor) at (x, z), with the airfields flattened in. */
export function heightAt(x, z) {
  let h = rawHeight(x, z);
  for (const af of AIRFIELDS) {
    const w = flattenWeight(af, x, z);
    if (w > 0) h = lerp(h, af.elevation, w);
  }
  return h;
}

/** What the aircraft would touch at (x, z): 'runway', 'grass', 'rough', 'sand' or 'water'. */
export function surfaceAt(x, z) {
  for (const af of AIRFIELDS) if (onRunway(af, x, z, 1.5)) return { kind: 'runway', field: af };
  const h = heightAt(x, z);
  if (h < SEA_LEVEL + 0.3) return { kind: 'water' };
  const e = 6;
  const slope = Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  for (const af of AIRFIELDS) if (flattenWeight(af, x, z) > 0.98) return { kind: 'grass', slope };
  if (slope > 0.12) return { kind: 'rough', slope };
  if (h < 4) return { kind: 'sand', slope };
  return { kind: 'grass', slope };
}

export function initTerrain(seed) {
  seedNoise(seed);
  for (const af of AIRFIELDS) {
    if (af.id === 'ridge') af.elevation = Math.max(60, Math.round(rawHeight(af.x, af.z)));
  }
}

const C = {
  deep: new THREE.Color(0x1d4f63), sand: new THREE.Color(0xd8c690), grass: new THREE.Color(0x6f9a4a),
  lush: new THREE.Color(0x3f7a3a), forest: new THREE.Color(0x2f5e33), rock: new THREE.Color(0x857a6b),
  rock2: new THREE.Color(0x6a6158), snow: new THREE.Color(0xf2f1ea), field: new THREE.Color(0x92a957),
};

function colourFor(x, z, h, slope, out) {
  const n = valueNoise(x * 0.01, z * 0.01) * 0.5 + 0.5;
  const n2 = valueNoise(x * 0.0031 + 7, z * 0.0031) * 0.5 + 0.5;
  if (h < 0.5) { out.copy(C.sand).lerp(C.deep, clamp(-h / 25, 0, 1)); return out; }
  if (h < 5 + n * 3) { out.copy(C.sand); return out; }
  out.copy(C.grass).lerp(C.lush, n2);
  if (h > 40) out.lerp(C.forest, smoothstep(40, 160, h) * 0.8 * (0.6 + 0.4 * n));
  // farm patchwork on the lowlands
  if (h < 90 && slope < 0.08) {
    const fx = Math.floor((x + 3000) / 170), fz = Math.floor((z + 3000) / 120);
    const cell = Math.abs(Math.sin(fx * 12.9898 + fz * 78.233) * 43758.5453) % 1;
    if (cell > 0.55) out.lerp(cell > 0.8 ? C.field : C.sand, 0.35);
  }
  const rockiness = smoothstep(0.35, 0.75, slope) + smoothstep(250, 400, h) * 0.7;
  out.lerp(n > 0.5 ? C.rock : C.rock2, clamp(rockiness, 0, 1));
  out.lerp(C.snow, smoothstep(330 + n * 70, 450 + n * 40, h) * (1 - smoothstep(0.75, 1.15, slope)));
  return out;
}

let grid = null;

/** Height of the rendered mesh at (x, z), matching its triangles exactly, so wheels meet what you see. */
export function meshHeightAt(x, z) {
  if (!grid) return heightAt(x, z);
  const fx = (x + grid.half) / grid.cell, fz = (z + grid.half) / grid.cell;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  if (ix < 0 || iz < 0 || ix >= grid.seg || iz >= grid.seg) return -40;
  const s = fx - ix, t = fz - iz, w = grid.seg + 1, H = grid.h;
  const ha = H[ix + w * iz], hb = H[ix + w * (iz + 1)], hc = H[ix + 1 + w * (iz + 1)], hd = H[ix + 1 + w * iz];
  if (s + t <= 1) return ha + (hd - ha) * s + (hb - ha) * t;
  return hc + (hb - hc) * (1 - s) + (hd - hc) * (1 - t);
}

/** Ground under the aircraft for the flight model: height of the mesh plus the kind of surface. */
export function groundAt(x, z) {
  const height = Math.max(SEA_LEVEL, meshHeightAt(x, z));
  const s = surfaceAt(x, z);
  if (s.kind === 'runway') return { height: s.field.elevation, kind: 'runway', field: s.field, slope: 0 };
  if (meshHeightAt(x, z) < SEA_LEVEL + 0.3) return { height: SEA_LEVEL, kind: 'water', slope: 0 };
  return { height, kind: s.kind, slope: s.slope || 0, field: s.field };
}

/** The land as one mesh with vertex colours; segments sets its resolution. */
export function buildTerrainMesh(segments = 320) {
  const size = WORLD_SIZE;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
  }
  geo.computeVertexNormals();
  grid = { seg: segments, cell: size / segments, half: size / 2, h: new Float32Array(pos.count) };
  for (let i = 0; i < pos.count; i++) grid.h[i] = pos.getY(i);
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i);
    const slope = Math.sqrt(1 - Math.min(1, nrm.getY(i) ** 2)) / Math.max(0.2, nrm.getY(i));
    colourFor(x, z, h, slope, col);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** A tiling grey speckle that breaks up the flat vertex colours close to the ground. */
function detailTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 175 + Math.floor(Math.random() * 80);
    g.fillStyle = `rgba(${v},${v},${v},0.55)`;
    const s = 2 + Math.random() * 7;
    g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, s, s * (0.4 + Math.random() * 0.6), Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(WORLD_SIZE / 40, WORLD_SIZE / 40);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A depth map of the sea floor so the water shader can paint shallows and surf. */
function depthTexture(res = 256) {
  const data = new Uint8Array(res * res * 4);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = (i / (res - 1) - 0.5) * WORLD_SIZE, z = (j / (res - 1) - 0.5) * WORLD_SIZE;
      const h = heightAt(x, z);
      const d = clamp(-h / 40, 0, 1);
      const k = (j * res + i) * 4;
      data[k] = Math.round((h > 0 ? 0 : 1 - d) * 255);
      data[k + 1] = h > 0 ? 255 : 0;
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, res, res);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** A shaded sea: deep blue offshore, turquoise in the shallows, glinting toward the sun. */
export function buildSea() {
  const uniforms = {
    uTime: { value: 0 },
    uDepth: { value: depthTexture() },
    uSize: { value: WORLD_SIZE },
    uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() },
    uDeep: { value: new THREE.Color(0x0f4a6e) },
    uShallow: { value: new THREE.Color(0x2aa3ac) },
    uSky: { value: new THREE.Color(0xa8d2ef) },
    uSunColor: { value: new THREE.Color(0xfff1d0) },
    uLight: { value: 1 },
    fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1 }, fogDensity: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform sampler2D uDepth; uniform float uSize;
      uniform vec3 uSunDir, uDeep, uShallow, uSky, uSunColor; uniform float uLight;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      float wave(vec2 p, vec2 d, float f, float s) { return sin(dot(p, d) * f + uTime * s); }
      void main() {
        vec2 uv = vWorld.xz / uSize + 0.5;
        vec4 dt = texture2D(uDepth, uv);
        float shallow = dt.r;
        vec2 p = vWorld.xz;
        float dx = wave(p, vec2(0.8, 0.6), 0.05, 1.3) * 0.5 + wave(p, vec2(-0.3, 0.95), 0.11, 2.1) * 0.3 + wave(p, vec2(0.95, -0.2), 0.23, 2.9) * 0.2;
        float dz = wave(p, vec2(0.6, -0.8), 0.07, 1.7) * 0.5 + wave(p, vec2(0.2, 0.98), 0.17, 2.4) * 0.3;
        // flatten the ripples with distance so they do not alias into stripes near the horizon
        float calm = 0.08 / (1.0 + distance(cameraPosition, vWorld) * 0.0022);
        vec3 n = normalize(vec3(dx * calm, 1.0, dz * calm));
        vec3 view = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, view), 0.0), 4.0);
        vec3 water = mix(uDeep, uShallow, smoothstep(0.15, 0.95, shallow)) * uLight;
        vec3 col = mix(water, uSky, fres * 0.65);
        vec3 h = normalize(uSunDir + view);
        float spec = pow(max(dot(n, h), 0.0), 220.0) * 1.6;
        col += uSunColor * spec;
        float coastBand = smoothstep(0.02, 0.25, dt.g) * (1.0 - smoothstep(0.3, 0.55, dt.g));
        float surf = coastBand * (0.6 + 0.4 * sin(uTime * 1.4 + length(p) * 0.08));
        col = mix(col, vec3(0.93, 0.96, 0.95) * max(uLight, 0.45), surf * 0.55);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE * 3, WORLD_SIZE * 3, 1, 1), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_LEVEL;
  sea.renderOrder = -1;
  return { mesh: sea, uniforms };
}
