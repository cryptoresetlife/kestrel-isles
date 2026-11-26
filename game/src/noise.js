// Seeded value noise and fractal sums used to shape the islands.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERM = new Uint8Array(512);
const GRAD = new Float32Array(256);

export function seedNoise(seed) {
  const rand = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) { p[i] = i; GRAD[i] = rand() * 2 - 1; }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

/** 2D value noise in [-1, 1]. */
export function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const X = xi & 255, Y = yi & 255;
  const a = GRAD[PERM[X + PERM[Y]]];
  const b = GRAD[PERM[X + 1 + PERM[Y]]];
  const c = GRAD[PERM[X + PERM[Y + 1]]];
  const d = GRAD[PERM[X + 1 + PERM[Y + 1]]];
  const u = fade(xf), v = fade(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal Brownian motion: octaves of value noise, roughly in [-1, 1]. */
export function fbm(x, y, octaves = 5) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq) * amp;
    norm += amp; amp *= 0.5; freq *= 2.03;
  }
  return sum / norm;
}

/** Ridged noise for mountain spines, in [0, 1]. */
export function ridged(x, y, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(x * freq, y * freq));
    sum += n * n * amp;
    norm += amp; amp *= 0.5; freq *= 2.11;
  }
  return sum / norm;
}

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
