// Backlit round instruments of the K-7 panel, drawn on any 2D canvas (the HUD cluster and the cockpit panel).

const LIT = '#ffeccc';
const GLOW = 'rgba(255,176,80,0.85)';
const NEEDLE = '#ff8a2a';
const TAU = Math.PI * 2;

function face(g, x, y, r, label) {
  g.save();
  // bezel
  const bez = g.createLinearGradient(x - r, y - r, x + r, y + r);
  bez.addColorStop(0, '#8b9198'); bez.addColorStop(0.5, '#2b2f34'); bez.addColorStop(1, '#6d737a');
  g.fillStyle = bez;
  g.beginPath(); g.arc(x, y, r * 1.1, 0, TAU); g.fill();
  g.fillStyle = '#0b0d10';
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  // faint warm backlight pooling from the rim
  const lit = g.createRadialGradient(x, y, r * 0.2, x, y, r);
  lit.addColorStop(0, 'rgba(255,150,60,0.0)'); lit.addColorStop(1, 'rgba(255,150,60,0.13)');
  g.fillStyle = lit;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  // screws
  g.fillStyle = '#3a3f45';
  for (const a of [0.78, 2.36, 3.93, 5.5]) { g.beginPath(); g.arc(x + Math.cos(a) * r * 1.03, y + Math.sin(a) * r * 1.03, r * 0.035, 0, TAU); g.fill(); }
  if (label) {
    g.fillStyle = 'rgba(255,236,204,0.75)';
    g.font = `600 ${Math.round(r * 0.15)}px "Segoe UI", system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, x, y + r * 0.48);
  }
  g.restore();
}

function litStyle(g, r) {
  g.strokeStyle = LIT; g.fillStyle = LIT;
  g.shadowColor = GLOW; g.shadowBlur = Math.max(2, r * 0.06);
}

function ticks(g, x, y, r, a0, a1, n, major, len = 0.12) {
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    const big = i % major === 0;
    const r1 = r * (big ? 1 - len * 1.6 : 1 - len);
    g.lineWidth = big ? r * 0.035 : r * 0.018;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r1 * 0.92, y + Math.sin(a) * r1 * 0.92);
    g.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92);
    g.stroke();
  }
}

function needle(g, x, y, r, a, len = 0.8, width = 0.05, color = NEEDLE) {
  g.save();
  g.translate(x, y); g.rotate(a);
  g.shadowColor = 'rgba(255,120,30,0.9)'; g.shadowBlur = r * 0.08;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(-r * 0.15, -r * width * 0.7); g.lineTo(r * len, 0); g.lineTo(-r * 0.15, r * width * 0.7);
  g.closePath(); g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#30343a';
  g.beginPath(); g.arc(0, 0, r * 0.08, 0, TAU); g.fill();
  g.restore();
}

function arcBand(g, x, y, r, a0, a1, color, w) {
  g.save(); g.strokeStyle = color; g.lineWidth = w; g.shadowBlur = 0;
  g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); g.restore();
}

/** Airspeed indicator in knots, with flap, normal, caution and never-exceed markings. */
export function airspeedGauge(g, x, y, r, kt) {
  face(g, x, y, r, 'KNOTS');
  const a0 = -Math.PI * 0.5, span = TAU * 0.86, maxKt = 200;
  const ang = (v) => a0 + span * Math.min(1, Math.max(0, v) / maxKt);
  arcBand(g, x, y, r * 0.8, ang(45), ang(85), 'rgba(240,240,240,0.9)', r * 0.05);
  arcBand(g, x, y, r * 0.86, ang(52), ang(130), '#3fcf5a', r * 0.06);
  arcBand(g, x, y, r * 0.86, ang(130), ang(171), '#f2c230', r * 0.06);
  arcBand(g, x, y, r * 0.86, ang(170), ang(173), '#ff3b30', r * 0.12);
  g.save(); litStyle(g, r);
  ticks(g, x, y, r, a0, a0 + span, 40, 4);
  g.font = `700 ${Math.round(r * 0.2)}px "Segoe UI", system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = 0; v <= 200; v += 40) {
    const a = ang(v);
    g.fillText(String(v), x + Math.cos(a) * r * 0.56, y + Math.sin(a) * r * 0.56);
  }
  g.restore();
  needle(g, x, y, r, ang(kt), 0.84);
}

/** Attitude indicator: sky and earth ball with pitch ladder and bank scale. */
export function attitudeGauge(g, x, y, r, pitchDeg, bankDeg) {
  face(g, x, y, r);
  g.save();
  g.beginPath(); g.arc(x, y, r * 0.96, 0, TAU); g.clip();
  g.translate(x, y);
  g.rotate(-bankDeg * Math.PI / 180);
  const px = r * 0.028; // pixels per degree
  const off = pitchDeg * px;
  g.fillStyle = '#2f7fd3'; g.fillRect(-r * 2, -r * 2 + off, r * 4, r * 2);
  g.fillStyle = '#8a5a2b'; g.fillRect(-r * 2, off, r * 4, r * 2);
  litStyle(g, r);
  g.lineWidth = r * 0.03;
  g.beginPath(); g.moveTo(-r * 2, off); g.lineTo(r * 2, off); g.stroke();
  g.lineWidth = r * 0.02;
  g.font = `600 ${Math.round(r * 0.12)}px "Segoe UI", system-ui, sans-serif`;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  for (let p = -30; p <= 30; p += 5) {
    if (p === 0) continue;
    const yy = off - p * px;
    const w = p % 10 === 0 ? r * 0.3 : r * 0.14;
    g.beginPath(); g.moveTo(-w, yy); g.lineTo(w, yy); g.stroke();
    if (p % 10 === 0) g.fillText(String(Math.abs(p)), w + r * 0.04, yy);
  }
  g.restore();
  // bank scale and pointer
  g.save(); litStyle(g, r); g.lineWidth = r * 0.03;
  for (const b of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const a = -Math.PI / 2 + b * Math.PI / 180;
    const l = b % 30 === 0 ? 0.14 : 0.08;
    g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95); g.lineTo(x + Math.cos(a) * r * (0.95 - l), y + Math.sin(a) * r * (0.95 - l)); g.stroke();
  }
  g.translate(x, y); g.rotate(-bankDeg * Math.PI / 180);
  g.fillStyle = NEEDLE; g.shadowColor = 'rgba(255,120,30,0.9)';
  g.beginPath(); g.moveTo(0, -r * 0.8); g.lineTo(-r * 0.07, -r * 0.68); g.lineTo(r * 0.07, -r * 0.68); g.closePath(); g.fill();
  g.restore();
  // fixed miniature aircraft
  g.save(); g.strokeStyle = '#ffb13b'; g.lineWidth = r * 0.06; g.lineCap = 'round';
  g.shadowColor = GLOW; g.shadowBlur = r * 0.08;
  g.beginPath(); g.moveTo(x - r * 0.5, y); g.lineTo(x - r * 0.16, y); g.lineTo(x - r * 0.08, y + r * 0.08); g.moveTo(x + r * 0.5, y); g.lineTo(x + r * 0.16, y); g.lineTo(x + r * 0.08, y + r * 0.08); g.stroke();
  g.fillStyle = '#ffb13b'; g.beginPath(); g.arc(x, y, r * 0.04, 0, TAU); g.fill();
  g.restore();
}

/** Three-pointer altimeter with a drum readout. */
export function altimeterGauge(g, x, y, r, ft) {
  face(g, x, y, r, 'ALT FT');
  g.save(); litStyle(g, r);
  ticks(g, x, y, r, -Math.PI / 2, Math.PI * 1.5, 50, 5);
  g.font = `700 ${Math.round(r * 0.22)}px "Segoe UI", system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i / 10 * TAU;
    g.fillText(String(i), x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62);
  }
  // drum window
  g.shadowBlur = 0;
  g.fillStyle = '#000'; g.fillRect(x - r * 0.36, y - r * 0.38, r * 0.72, r * 0.22);
  g.fillStyle = LIT; g.font = `700 ${Math.round(r * 0.18)}px "Consolas", monospace`;
  g.fillText(String(Math.max(0, Math.round(ft))).padStart(5, '0'), x, y - r * 0.27);
  g.restore();
  const a1 = -Math.PI / 2 + (ft % 1000) / 1000 * TAU;
  const a2 = -Math.PI / 2 + (ft % 10000) / 10000 * TAU;
  needle(g, x, y, r, a2 - Math.PI / 2 + Math.PI / 2, 0.5, 0.09, '#e8e8e8');
  needle(g, x, y, r, a1, 0.86, 0.05);
}

/** Heading indicator: compass card that turns under a fixed lubber line. */
export function headingGauge(g, x, y, r, hdg, bug) {
  face(g, x, y, r);
  g.save(); litStyle(g, r);
  g.translate(x, y); g.rotate(-hdg * Math.PI / 180);
  for (let d = 0; d < 360; d += 5) {
    const a = d * Math.PI / 180 - Math.PI / 2;
    const big = d % 30 === 0;
    g.lineWidth = big ? r * 0.035 : r * 0.016;
    const l = big ? 0.16 : d % 10 === 0 ? 0.1 : 0.06;
    g.beginPath(); g.moveTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92); g.lineTo(Math.cos(a) * r * (0.92 - l), Math.sin(a) * r * (0.92 - l)); g.stroke();
  }
  g.font = `700 ${Math.round(r * 0.2)}px "Segoe UI", system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const labels = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  for (let d = 0; d < 360; d += 30) {
    g.save();
    g.rotate(d * Math.PI / 180);
    g.fillStyle = labels[d] ? '#ffd27a' : LIT;
    g.fillText(labels[d] || String(d / 10), 0, -r * 0.58);
    g.restore();
  }
  if (bug !== undefined && bug !== null) {
    g.save(); g.rotate(bug * Math.PI / 180); g.shadowBlur = 0; g.fillStyle = '#39e1ff';
    g.fillRect(-r * 0.08, -r * 0.98, r * 0.16, r * 0.1); g.restore();
  }
  g.restore();
  // lubber line and aircraft
  g.save(); g.fillStyle = NEEDLE; g.shadowColor = GLOW; g.shadowBlur = r * 0.08;
  g.beginPath(); g.moveTo(x, y - r * 0.78); g.lineTo(x - r * 0.06, y - r * 0.94); g.lineTo(x + r * 0.06, y - r * 0.94); g.closePath(); g.fill();
  g.strokeStyle = '#ffb13b'; g.lineWidth = r * 0.05; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, y - r * 0.3); g.lineTo(x, y + r * 0.25); g.moveTo(x - r * 0.25, y - r * 0.05); g.lineTo(x + r * 0.25, y - r * 0.05); g.moveTo(x - r * 0.1, y + r * 0.22); g.lineTo(x + r * 0.1, y + r * 0.22); g.stroke();
  g.restore();
}

/** Vertical speed indicator, feet per minute (hundreds). */
export function vsiGauge(g, x, y, r, fpm) {
  face(g, x, y, r, 'VS 100 FT/MIN');
  const ang = (v) => Math.PI + Math.max(-1, Math.min(1, v / 2000)) * Math.PI * 0.85;
  g.save(); litStyle(g, r);
  ticks(g, x, y, r, ang(-2000), ang(2000), 40, 5);
  g.font = `700 ${Math.round(r * 0.2)}px "Segoe UI", system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const v of [0, 500, 1000, 1500, 2000, -500, -1000, -1500]) {
    const a = ang(v);
    g.fillText(String(Math.abs(v / 100)), x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
  }
  g.restore();
  needle(g, x, y, r, ang(fpm), 0.84);
}

/** Engine gauge: RPM needle on top, fuel quantity bar below, with low-fuel warning. */
export function engineGauge(g, x, y, r, rpm, fuelFrac, warn) {
  face(g, x, y, r);
  const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
  const ang = (v) => a0 + (a1 - a0) * Math.min(1, Math.max(0, v / 3000));
  arcBand(g, x, y, r * 0.86, ang(2000), ang(2650), '#3fcf5a', r * 0.06);
  arcBand(g, x, y, r * 0.86, ang(2650), ang(2720), '#ff3b30', r * 0.1);
  g.save(); litStyle(g, r);
  ticks(g, x, y, r, a0, a1, 30, 5);
  g.font = `700 ${Math.round(r * 0.17)}px "Segoe UI", system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = 0; v <= 3000; v += 1000) { const a = ang(v); g.fillText(String(v / 100), x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6); }
  g.font = `600 ${Math.round(r * 0.13)}px "Segoe UI", system-ui, sans-serif`;
  g.fillText('RPM', x, y - r * 0.32);
  // fuel bar
  const bw = r * 1.0, bh = r * 0.14, bx = x - bw / 2, by = y + r * 0.42;
  g.shadowBlur = 0;
  g.fillStyle = '#1b1e22'; g.fillRect(bx, by, bw, bh);
  g.fillStyle = fuelFrac < 0.15 ? (warn ? '#ff3b30' : '#7a1d18') : '#3fcf5a';
  g.fillRect(bx, by, bw * Math.max(0, Math.min(1, fuelFrac)), bh);
  g.fillStyle = LIT;
  g.fillText('FUEL', x, by - r * 0.1);
  g.restore();
  needle(g, x, y, r, ang(rpm * 2700), 0.82);
}

/** Draws the whole six-pack panel in a row starting at (x, y) with gauge radius r. */
export function drawSixPack(g, x, y, r, s) {
  const gap = r * 2.45;
  airspeedGauge(g, x, y, r, s.kt);
  attitudeGauge(g, x + gap, y, r, s.pitch, s.bank);
  altimeterGauge(g, x + gap * 2, y, r, s.ft);
  headingGauge(g, x + gap * 3, y, r, s.hdg, s.bug);
  vsiGauge(g, x + gap * 4, y, r, s.fpm);
  engineGauge(g, x + gap * 5, y, r, s.rpm, s.fuel, s.blink);
}
