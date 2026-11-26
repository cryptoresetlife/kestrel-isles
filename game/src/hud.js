// The head-up display: speed, altitude and heading tapes, target cues, radar, mission card and gauges.
import * as THREE from 'three';
import { drawSixPack } from './instruments.js';
import { heightAt, WORLD_SIZE } from './terrain.js';
import { AIRFIELDS, runwayWorld } from './airfields.js';

const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';
const MONO = '"Consolas", "SFMono-Regular", ui-monospace, monospace';
const INK = '#f4fbff', SHADOW = 'rgba(0,10,20,0.75)', CUE = '#ffc23a', CYAN = '#56e0ff', WARN = '#ff4d3d', OK = '#5dff9a';
const _p = new THREE.Vector3();

function mapImage(size = 360) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i / size - 0.5) * WORLD_SIZE, z = (j / size - 0.5) * WORLD_SIZE;
      const h = heightAt(x, z);
      const k = (j * size + i) * 4;
      if (h < 0.3) { const d = Math.min(1, -h / 30); img.data[k] = 20 + 30 * (1 - d); img.data[k + 1] = 70 + 70 * (1 - d); img.data[k + 2] = 105 + 60 * (1 - d); }
      else { const t = Math.min(1, h / 600); img.data[k] = 70 + 120 * t; img.data[k + 1] = 120 + 70 * t; img.data[k + 2] = 60 + 110 * t; }
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = '#f4f4f4'; g.lineWidth = 3;
  for (const af of AIRFIELDS) {
    const a = runwayWorld(af, -af.length / 2, 0), b = runwayWorld(af, af.length / 2, 0);
    g.beginPath(); g.moveTo((a.x / WORLD_SIZE + 0.5) * size, (a.z / WORLD_SIZE + 0.5) * size); g.lineTo((b.x / WORLD_SIZE + 0.5) * size, (b.z / WORLD_SIZE + 0.5) * size); g.stroke();
  }
  return c;
}

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.messages = [];
    this.map = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    this.W = innerWidth; this.H = innerHeight;
  }

  /** A banner in the middle of the screen; kind picks the colour. */
  flash(text, sub = '', kind = 'info', secs = 2.6) {
    this.messages = this.messages.filter((m) => m.kind !== kind || kind === 'info');
    this.messages.push({ text, sub, kind, t: 0, secs });
    if (this.messages.length > 2) this.messages.shift();
  }

  clear() { this.g.setTransform(1, 0, 0, 1, 0, 0); this.g.clearRect(0, 0, this.canvas.width, this.canvas.height); }

  text(str, x, y, size, color = INK, align = 'left', weight = 700, font = FONT) {
    const g = this.g;
    g.font = `${weight} ${size}px ${font}`;
    g.textAlign = align; g.textBaseline = 'middle';
    g.fillStyle = SHADOW; g.fillText(str, x + 1.5, y + 1.5);
    g.fillStyle = color; g.fillText(str, x, y);
  }

  panel(x, y, w, h, r = 10, alpha = 0.42) {
    const g = this.g;
    g.fillStyle = `rgba(6,16,28,${alpha})`;
    g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
    g.strokeStyle = 'rgba(160,220,255,0.25)'; g.lineWidth = 1; g.stroke();
  }

  draw(s, camera, dt) {
    if (!this.map) this.map = mapImage();
    this.clear();
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.W, H = this.H;
    const compact = W < 760 || H < 500;
    const touch = document.body.classList.contains('touch');
    const scale = Math.max(0.72, Math.min(1.25, Math.min(W / 1280, H / 720) * 1.05));
    this.scale = scale;
    if (s.runwayCue) this.runwayBox(s, camera, W, H, scale);
    if (s.showTargets) this.targets(s, camera, W, H, scale);
    this.flightPath(s, camera, W, H, scale);
    this.headingTape(s, W / 2, 34 * scale, Math.min(W * 0.46, 560 * scale), 46 * scale, scale);
    const tapeH = touch ? Math.min(H * 0.3, 220 * scale) : Math.min(H * 0.4, 290 * scale);
    const tapeY = touch ? H * 0.38 : H * 0.5;
    this.speedTape(s, 44 * scale + (compact ? 0 : 20), tapeY, 92 * scale, tapeH, scale);
    this.altTape(s, W - (44 * scale + (compact ? 0 : 20)) - 92 * scale, tapeY, 92 * scale, tapeH, scale);
    if (!compact) this.missionCard(s, 18, 14, scale);
    else this.missionCompact(s, W, scale);
    this.radar(s, W - 80 * scale - 22, 80 * scale + 14, 80 * scale, scale, compact);
    if (s.view === 'chase' && !compact && H > 520) this.cluster(s, W, H, scale);
    this.statusStrip(s, W, H, scale, compact);
    this.banners(dt, W, H, scale);
    if (s.hint) this.hint(s.hint, W, H, scale);
  }

  headingTape(s, cx, y, w, h, k) {
    const g = this.g;
    this.panel(cx - w / 2, y - h / 2, w, h, 8);
    g.save();
    g.beginPath(); g.rect(cx - w / 2, y - h / 2, w, h); g.clip();
    const ppd = w / 90;
    const labels = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    for (let d = Math.floor(s.hdg - 50); d <= s.hdg + 50; d++) {
      const dd = ((d % 360) + 360) % 360;
      const x = cx + (d - s.hdg) * ppd;
      if (dd % 5 !== 0) continue;
      g.strokeStyle = INK; g.lineWidth = dd % 10 === 0 ? 2 : 1;
      g.beginPath(); g.moveTo(x, y + h / 2); g.lineTo(x, y + h / 2 - (dd % 10 === 0 ? 11 : 6) * k); g.stroke();
      if (dd % 10 === 0) this.text(labels[dd] || String(dd / 10).padStart(2, '0'), x, y - 4 * k, (labels[dd] ? 17 : 13) * k, labels[dd] ? CUE : INK, 'center');
    }
    if (s.bearing !== null && s.bearing !== undefined) {
      let rel = ((s.bearing - s.hdg + 540) % 360) - 180;
      const x = cx + Math.max(-45, Math.min(45, rel)) * ppd;
      g.fillStyle = CYAN;
      g.beginPath(); g.moveTo(x, y + h / 2 - 2); g.lineTo(x - 8 * k, y + h / 2 - 14 * k); g.lineTo(x + 8 * k, y + h / 2 - 14 * k); g.closePath(); g.fill();
    }
    g.restore();
    // readout box
    const bw = 74 * k, bh = 30 * k;
    g.fillStyle = 'rgba(0,0,0,0.75)'; g.strokeStyle = CUE; g.lineWidth = 2;
    g.beginPath(); g.roundRect(cx - bw / 2, y + h / 2 + 4, bw, bh, 5); g.fill(); g.stroke();
    this.text(String(Math.round(s.hdg) % 360).padStart(3, '0') + '°', cx, y + h / 2 + 4 + bh / 2, 20 * k, INK, 'center', 800, MONO);
    this.text('HDG', cx - bw / 2 - 8, y + h / 2 + 4 + bh / 2, 13 * k, 'rgba(244,251,255,0.8)', 'right');
  }

  tape(s, x, y, w, h, value, step, labelEvery, unit, title, k, bands, side) {
    const g = this.g;
    this.panel(x, y - h / 2, w, h, 8);
    g.save();
    g.beginPath(); g.rect(x, y - h / 2, w, h); g.clip();
    const ppu = h / (step * 12);
    if (bands) for (const b of bands) {
      const y0 = y - (b[1] - value) * ppu, y1 = y - (b[0] - value) * ppu;
      g.fillStyle = b[2];
      g.fillRect(side === 'left' ? x + w - 6 * k : x, y0, 6 * k, y1 - y0);
    }
    const start = Math.floor((value - step * 7) / step) * step;
    for (let v = start; v <= value + step * 7; v += step) {
      if (v < 0) continue;
      const yy = y - (v - value) * ppu;
      const major = v % labelEvery === 0;
      g.strokeStyle = INK; g.lineWidth = major ? 2 : 1;
      const tx = side === 'left' ? x + w : x;
      const dir = side === 'left' ? -1 : 1;
      g.beginPath(); g.moveTo(tx, yy); g.lineTo(tx + dir * (major ? 12 : 6) * k, yy); g.stroke();
      if (major) this.text(String(v), side === 'left' ? x + w - 18 * k : x + 18 * k, yy, 14 * k, INK, side === 'left' ? 'right' : 'left', 600, MONO);
    }
    g.restore();
    // pointer box with the current value
    const bh = 34 * k, bw = w + 10 * k;
    const bx = side === 'left' ? x - 4 * k : x - 6 * k;
    g.fillStyle = 'rgba(0,0,0,0.82)'; g.strokeStyle = CUE; g.lineWidth = 2;
    g.beginPath(); g.roundRect(bx, y - bh / 2, bw, bh, 5); g.fill(); g.stroke();
    this.text(String(Math.round(value)), bx + bw / 2, y, 22 * k, INK, 'center', 800, MONO);
    this.text(title, x + w / 2, y - h / 2 - 12 * k, 15 * k, CUE, 'center', 800);
    this.text(unit, x + w / 2, y + h / 2 + 12 * k, 12 * k, 'rgba(244,251,255,0.8)', 'center', 600);
  }

  speedTape(s, x, y, w, h, k) {
    const bands = [[0, 48, 'rgba(255,77,61,0.9)'], [52, 130, 'rgba(93,255,154,0.85)'], [130, 171, 'rgba(255,194,58,0.9)'], [171, 400, 'rgba(255,77,61,0.9)']];
    this.tape(s, x, y, w, h, s.kt, 5, 20, 'KNOTS', 'SPD', k, bands, 'left');
    this.text(`GS ${Math.round(s.gs)}`, x + w / 2, y + h / 2 + 30 * k, 13 * k, INK, 'center', 600, MONO);
  }

  altTape(s, x, y, w, h, k) {
    this.tape(s, x, y, w, h, s.ft, 20, 100, 'FEET', 'ALT', k, null, 'right');
    const fpm = Math.round(s.fpm / 10) * 10;
    this.text(`${fpm > 0 ? '▲' : fpm < 0 ? '▼' : ' '} ${Math.abs(fpm)} fpm`, x + w / 2, y + h / 2 + 30 * k, 13 * k, Math.abs(fpm) > 1200 ? WARN : INK, 'center', 600, MONO);
    if (s.aglFt < 2500) this.text(`RA ${Math.max(0, Math.round(s.aglFt))}`, x + w / 2, y + h / 2 + 48 * k, 13 * k, s.aglFt < 200 ? CUE : INK, 'center', 700, MONO);
  }

  flightPath(s, camera, W, H, k) {
    if (s.speed < 5 || s.view === 'orbit') return;
    _p.copy(s.pos).addScaledVector(s.velDir, 300).project(camera);
    if (_p.z > 1) return;
    const x = (_p.x * 0.5 + 0.5) * W, y = (-_p.y * 0.5 + 0.5) * H;
    const g = this.g;
    g.strokeStyle = OK; g.lineWidth = 2.2; g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 3;
    g.beginPath(); g.arc(x, y, 8 * k, 0, Math.PI * 2);
    g.moveTo(x - 8 * k, y); g.lineTo(x - 20 * k, y); g.moveTo(x + 8 * k, y); g.lineTo(x + 20 * k, y); g.moveTo(x, y - 8 * k); g.lineTo(x, y - 15 * k);
    g.stroke(); g.shadowBlur = 0;
  }

  /** Diamond over the next target, or an arrow at the edge pointing to it. */
  targets(s, camera, W, H, k) {
    if (!s.target) return;
    const g = this.g;
    _p.copy(s.target.pos).project(camera);
    const behind = _p.z > 1;
    let x = (_p.x * 0.5 + 0.5) * W, y = (-_p.y * 0.5 + 0.5) * H;
    if (behind) { x = W - x; y = H - y; }
    const m = 70 * k;
    const onScreen = !behind && x > m && x < W - m && y > m && y < H - m;
    const dist = s.target.dist;
    const label = dist > 1852 ? `${(dist / 1852).toFixed(1)} NM` : `${Math.round(dist * 3.28084).toLocaleString()} FT`;
    if (onScreen && s.target.ring) {
      _p.copy(s.target.pos).add(s.target.up).project(camera);
      const ty = Math.min(y - 18 * k, (-_p.y * 0.5 + 0.5) * H - 14 * k);
      this.text(`${s.target.label} · ${label}`, x, ty, 13 * k, CUE, 'center', 800);
    } else if (onScreen && s.runwayCue) {
      // the runway box already names the field; just give the distance to the threshold
      this.text(label, x, y + 16 * k, 13 * k, INK, 'center', 700, MONO);
    } else if (onScreen) {
      g.strokeStyle = CUE; g.lineWidth = 2.5;
      const r = 12 * k;
      g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.stroke();
      this.text(s.target.label, x, y - r - 12 * k, 13 * k, CUE, 'center', 800);
      this.text(label, x, y + r + 12 * k, 13 * k, INK, 'center', 700, MONO);
    } else {
      const cx = W / 2, cy = H / 2;
      const a = Math.atan2(y - cy, x - cx);
      const ex = cx + Math.cos(a) * (W / 2 - m), ey = cy + Math.sin(a) * (H / 2 - m);
      g.save(); g.translate(ex, ey); g.rotate(a);
      g.fillStyle = CUE;
      g.beginPath(); g.moveTo(18 * k, 0); g.lineTo(-8 * k, -12 * k); g.lineTo(-3 * k, 0); g.lineTo(-8 * k, 12 * k); g.closePath(); g.fill();
      g.restore();
      this.text(label, ex - Math.cos(a) * 30 * k, ey - Math.sin(a) * 26 * k, 12 * k, INK, 'center', 700, MONO);
    }
  }

  /** Outlines the destination runway in the HUD, like a synthetic-vision box, with its number. */
  runwayBox(s, camera, W, H, k) {
    const cue = s.runwayCue;
    const pts = [];
    for (const c of cue.corners) {
      _p.copy(c).project(camera);
      if (_p.z > 1) return;
      pts.push([(_p.x * 0.5 + 0.5) * W, (-_p.y * 0.5 + 0.5) * H]);
    }
    const g = this.g;
    g.save();
    g.strokeStyle = CYAN; g.lineWidth = 2; g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 3;
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
    // extended centreline toward the pilot
    const nx = (pts[0][0] + pts[1][0]) / 2, ny = (pts[0][1] + pts[1][1]) / 2;
    const fx = (pts[2][0] + pts[3][0]) / 2, fy = (pts[2][1] + pts[3][1]) / 2;
    g.setLineDash([6, 6]); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(nx, ny); g.lineTo(nx + (nx - fx) * 0.6, ny + (ny - fy) * 0.6); g.stroke();
    g.restore();
    const top = Math.min(...pts.map((p) => p[1]));
    const cx = pts.reduce((a, p) => a + p[0], 0) / 4;
    this.text(cue.label, cx, top - 12 * k, 13 * k, CYAN, 'center', 800);
  }

  missionCard(s, x, y, k) {
    const w = 300 * k, lines = s.objectives || [];
    const h = (64 + lines.length * 22) * k;
    this.panel(x, y, w, h, 10, 0.5);
    this.text(s.missionName.toUpperCase(), x + 14 * k, y + 18 * k, 15 * k, CUE, 'left', 800);
    if (s.timer !== null) this.text(formatTime(s.timer), x + w - 14 * k, y + 18 * k, 16 * k, INK, 'right', 800, MONO);
    this.text(s.objective, x + 14 * k, y + 42 * k, 14 * k, INK, 'left', 600);
    lines.forEach((l, i) => {
      const yy = y + (66 + i * 22) * k;
      this.text(l.done ? '✓' : '•', x + 16 * k, yy, 14 * k, l.done ? OK : 'rgba(244,251,255,0.6)', 'left', 800);
      this.text(l.text, x + 34 * k, yy, 13 * k, l.done ? 'rgba(244,251,255,0.55)' : INK, 'left', 600);
    });
  }

  missionCompact(s, W, k) {
    const y = 86 * k;
    this.text(s.objective, 12, y, 13 * k, INK, 'left', 700);
    if (s.timer !== null) this.text(formatTime(s.timer), 12, y + 20 * k, 14 * k, CUE, 'left', 800, MONO);
  }

  radar(s, cx, cy, r, k, compact) {
    if (compact) { r *= 0.62; cx = this.W - r - 10; cy = this.H * 0.44 + 190 * k; if (cy + r > this.H - 120) return; }
    const g = this.g;
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.closePath();
    g.fillStyle = 'rgba(6,16,28,0.55)'; g.fill();
    g.clip();
    const range = 4500; // metres from centre to edge
    const ppm = r / range;
    g.translate(cx, cy);
    g.rotate(-s.hdg * Math.PI / 180);
    const ms = this.map.width;
    const px = (s.pos.x / WORLD_SIZE + 0.5) * ms, pz = (s.pos.z / WORLD_SIZE + 0.5) * ms;
    const sc = (WORLD_SIZE / ms) * ppm;
    g.globalAlpha = 0.85;
    g.drawImage(this.map, -px * sc, -pz * sc, ms * sc, ms * sc);
    g.globalAlpha = 1;
    for (const p of s.radarPoints || []) {
      const dx = (p.x - s.pos.x) * ppm, dz = (p.z - s.pos.z) * ppm;
      g.fillStyle = p.color;
      g.beginPath(); g.arc(dx, dz, p.size * k, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    g.strokeStyle = 'rgba(160,220,255,0.6)'; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    // own aircraft
    g.fillStyle = CUE;
    g.beginPath(); g.moveTo(cx, cy - 9 * k); g.lineTo(cx - 6 * k, cy + 6 * k); g.lineTo(cx, cy + 3 * k); g.lineTo(cx + 6 * k, cy + 6 * k); g.closePath(); g.fill();
    // north marker on the ring
    const na = -s.hdg * Math.PI / 180 - Math.PI / 2;
    this.text('N', cx + Math.cos(na) * (r - 10 * k), cy + Math.sin(na) * (r - 10 * k), 12 * k, CUE, 'center', 800);
  }

  cluster(s, W, H, k) {
    const r = Math.min(46 * k, W / 34);
    const gap = r * 2.45;
    const total = gap * 5 + r * 2.4;
    const x0 = W / 2 - total / 2 + r * 1.2;
    const y = H - r * 1.3 - 8;
    const g = this.g;
    g.fillStyle = 'rgba(14,18,22,0.78)';
    g.beginPath(); g.roundRect(W / 2 - total / 2, y - r * 1.25, total, r * 2.5, 14); g.fill();
    g.strokeStyle = 'rgba(255,190,120,0.3)'; g.lineWidth = 1.5; g.stroke();
    drawSixPack(g, x0, y, r, s);
  }

  statusStrip(s, W, H, k, compact) {
    const items = [
      { t: s.gearDown ? 'GEAR DN' : s.gearMoving ? 'GEAR …' : 'GEAR UP', c: s.gearDown ? OK : s.gearMoving ? CUE : 'rgba(244,251,255,0.65)' },
      { t: `FLAPS ${s.flaps}`, c: s.flaps ? CYAN : 'rgba(244,251,255,0.65)' },
      { t: `THR ${Math.round(s.throttle * 100)}%`, c: INK },
      { t: `FUEL ${Math.round(s.fuel * 100)}%`, c: s.fuel < 0.15 ? WARN : INK },
    ];
    if (s.damage > 1) items.push({ t: `DMG ${Math.round(s.damage)}%`, c: s.damage > 50 ? WARN : CUE });
    if (s.brake) items.push({ t: 'BRAKE', c: CUE });
    if (s.stall) items.push({ t: 'STALL', c: WARN, blink: true });
    if (!s.engineOn) items.push({ t: 'ENGINE OUT', c: WARN, blink: true });
    if (s.overspeed) items.push({ t: 'OVERSPEED', c: WARN, blink: true });
    if (s.pullUp) items.push({ t: 'PULL UP', c: WARN, blink: true });
    const y = s.view === 'chase' && !compact && H > 520 ? H - Math.min(46 * k, W / 34) * 2.55 - 26 * k : H - 26 * k;
    const sz = (compact ? 11 : 14) * k;
    this.g.font = `800 ${sz}px ${FONT}`;
    const widths = items.map((i) => this.g.measureText(i.t).width + 22 * k);
    let x = W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
    const blinkOn = Math.floor(performance.now() / 300) % 2 === 0;
    items.forEach((it, i) => {
      if (!(it.blink && !blinkOn)) {
        this.panel(x + 2, y - 13 * k, widths[i] - 4, 26 * k, 6, it.blink ? 0.75 : 0.45);
        this.text(it.t, x + widths[i] / 2, y, sz, it.c, 'center', 800);
      }
      x += widths[i];
    });
  }

  banners(dt, W, H, k) {
    for (const m of this.messages) m.t += dt;
    this.messages = this.messages.filter((m) => m.t < m.secs);
    this.messages.forEach((m, i) => {
      const a = Math.min(1, m.t * 5, (m.secs - m.t) * 2);
      this.g.globalAlpha = a;
      const col = m.kind === 'bad' ? WARN : m.kind === 'good' ? OK : m.kind === 'ring' ? CUE : INK;
      const y = H * 0.3 + i * 64 * k;
      this.text(m.text, W / 2, y, 34 * k, col, 'center', 900);
      if (m.sub) this.text(m.sub, W / 2, y + 30 * k, 16 * k, INK, 'center', 600);
      this.g.globalAlpha = 1;
    });
  }

  hint(text, W, H, k) {
    const lines = text.split('\n');
    const y0 = H * 0.66;
    lines.forEach((l, i) => this.text(l, W / 2, y0 + i * 22 * k, 15 * k, 'rgba(244,251,255,0.92)', 'center', 600));
  }
}

export function formatTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor((t * 10) % 10);
  return `${m}:${String(s).padStart(2, '0')}.${d}`;
}
