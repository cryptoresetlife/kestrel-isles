// The pilot's seat: dashboard with a live instrument panel, glareshield, canopy frame and stick.
import * as THREE from 'three';
import { airspeedGauge, attitudeGauge, altimeterGauge, headingGauge, vsiGauge, engineGauge } from './instruments.js';
import { FUSELAGE_PROFILE } from './aircraft.js';

export class Cockpit {
  constructor(aircraft) {
    this.group = new THREE.Group();
    this.group.visible = false;
    aircraft.root.add(this.group);
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280; this.canvas.height = 640;
    this.plate = paintPlate(1280, 640);
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;

    const dark = new THREE.MeshLambertMaterial({ color: 0x4b5058, emissive: 0x23262b });
    const trim = new THREE.MeshLambertMaterial({ color: 0x2a2d32, emissive: 0x101214 });
    const wallMat = new THREE.MeshBasicMaterial({ color: 0x3a3f47 });
    const sillMat = new THREE.MeshBasicMaterial({ color: 0x23262b });
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x5a6068 });
    // the nose ahead of the windscreen, seen over the glareshield
    const nosePts = [[0.69, 0.95], ...FUSELAGE_PROFILE.filter(([, y]) => y > 0.95)].map(([r, y]) => new THREE.Vector2(r, y));
    const noseGeo = new THREE.LatheGeometry(nosePts, 24);
    noseGeo.rotateX(-Math.PI / 2); noseGeo.scale(0.92, 1, 1);
    this.group.add(new THREE.Mesh(noseGeo, new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.5, metalness: 0.15 })));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.56), new THREE.MeshBasicMaterial({ map: this.tex }));
    panel.position.set(0, 0.368, -0.74);
    panel.rotation.x = -0.12;
    const backing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.06), wallMat);
    backing.position.set(0, 0.32, -0.78); backing.rotation.x = -0.12;
    const glare = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.32), sillMat);
    glare.position.set(0, 0.675, -0.86);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 8), trim);
    lip.rotation.z = Math.PI / 2; lip.position.set(0, 0.675, -0.71);
    // sidewalls and the floor of the cockpit tub
    const wallGeo = new THREE.PlaneGeometry(1.8, 0.7);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set(side * 0.58, 0.2, -0.1);
      wall.rotation.y = -side * Math.PI / 2;
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 1.8), sillMat);
      sill.position.set(side * 0.58, 0.55, -0.1);
      // canopy frame: windscreen pillar and the bow behind the head
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.62, 6), frameMat);
      pillar.position.set(side * 0.42, 0.88, -0.66);
      pillar.rotation.z = side * 0.62; pillar.rotation.x = -0.55;
      this.group.add(wall, sill, pillar);
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.8), trim);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.05, -0.1);
    // control stick
    this.stick = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.3, 8), new THREE.MeshLambertMaterial({ color: 0x555b62 }));
    shaft.position.y = 0.15;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.11, 10), trim);
    grip.position.y = 0.33;
    this.stick.add(shaft, grip);
    this.stick.position.set(0, -0.02, -0.5);
    // throttle quadrant with an orange knob
    this.lever = new THREE.Group();
    const lshaft = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.16), new THREE.MeshLambertMaterial({ color: 0x666c73 }));
    lshaft.position.z = -0.08;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshLambertMaterial({ color: 0xff7a1a }));
    knob.position.z = -0.16;
    this.lever.add(lshaft, knob);
    this.lever.position.set(0.3, 0.1, -0.56);
    this.group.add(panel, backing, glare, lip, floor, this.stick, this.lever);
    this.hideInCockpit = [aircraft.canopy];
    this.eye = new THREE.Vector3(0, 0.86, 0.12);
  }

  setActive(on, aircraft) {
    this.group.visible = on;
    for (const o of aircraft.exterior.children) {
      // keep wings, cowling and prop in view; hide the pilot and canopy we sit inside
      if (o.geometry && o.geometry.type === 'SphereGeometry') o.visible = !on;
    }
    aircraft.canopy.visible = !on;
    aircraft.fuselage.visible = !on;
    aircraft.inCockpit = on;
    aircraft.canopyFrame.visible = !on;
    for (const s of aircraft.sideStripes) s.visible = !on;
  }

  /** Redraws the panel instruments and moves the stick and throttle. */
  update(state, controls) {
    const g = this.g, W = this.canvas.width, H = this.canvas.height;
    g.drawImage(this.plate, 0, 0);
    const r = 104, cx = W / 2, gap = 236, y1 = 176, y2 = 412;
    airspeedGauge(g, cx - gap, y1, r, state.kt);
    attitudeGauge(g, cx, y1, r, state.pitch, state.bank);
    altimeterGauge(g, cx + gap, y1, r, state.ft);
    engineGauge(g, cx - gap, y2, r, state.rpm, state.fuel, state.blink);
    headingGauge(g, cx, y2, r, state.hdg, state.bug);
    vsiGauge(g, cx + gap, y2, r, state.fpm);
    // annunciator lamps along the top of the panel
    const lamps = [['GEAR', state.gearDown ? '#3fcf5a' : (state.gearMoving ? '#f2c230' : OFF)], ['FLAPS ' + state.flaps, state.flaps ? '#39e1ff' : OFF], ['STALL', state.stall ? '#ff3b30' : OFF], ['FUEL', state.fuel < 0.15 ? '#ff3b30' : OFF], ['BRK', state.brake ? '#f2c230' : OFF]];
    g.font = '700 17px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lamps.forEach(([t, c], i) => {
      const x = cx - 280 + i * 140, y = 30;
      g.fillStyle = c; g.fillRect(x - 60, y - 14, 120, 28);
      g.fillStyle = c === OFF ? '#6a6f76' : '#0b0d10'; g.fillText(t, x, y + 1);
    });
    // live readouts: radio stack digits, flap and throttle markers, fuel bar
    g.font = '700 30px Consolas, "Courier New", monospace'; g.textAlign = 'right';
    g.fillStyle = '#ffb347';
    g.fillText(String(Math.round(state.hdg) % 360).padStart(3, '0'), 1236, 290);
    g.fillText(String(Math.max(0, Math.round(state.ft))), 1236, 368);
    g.fillStyle = '#39e1ff';
    g.fillRect(64, 120 + state.flaps * 44, 46, 10);
    g.fillStyle = '#ff7a1a';
    g.fillRect(170, 226 - controls.throttle * 112, 46, 12);
    g.fillStyle = state.fuel < 0.15 ? '#ff3b30' : '#3fcf5a';
    g.fillRect(48, 304, 172 * Math.max(0, Math.min(1, state.fuel)), 16);
    this.tex.needsUpdate = true;
    this.stick.rotation.x = -controls.pitch * 0.3;
    this.stick.rotation.z = -controls.roll * 0.3;
    this.lever.position.z = -0.56 - controls.throttle * 0.1;
  }
}

const OFF = '#30343a';

/** Paints everything on the panel that never changes: plate, screws, switches, radio stack and placards. */
function paintPlate(W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#454b53'); bg.addColorStop(1, '#262a30');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.035)';
  for (let x = 0; x < W; x += 5) g.fillRect(x, 0, 1, H);
  const inset = (x, y, w, h, fill = '#1c1f24') => {
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
    g.fillStyle = fill; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
  };
  const screw = (x, y) => {
    g.fillStyle = '#8a9099'; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#30343a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 4, y - 2); g.lineTo(x + 4, y + 2); g.stroke();
  };
  const label = (t, x, y, size = 15, color = '#c9ced6') => {
    g.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color; g.fillText(t, x, y);
  };
  // centre plate that carries the six flight instruments
  inset(266, 52, 748, 484, '#2b3037');
  for (const [x, y] of [[280, 66], [1000, 66], [280, 522], [1000, 522], [640, 294]]) screw(x, y);
  // left bay: flap and throttle strips, fuel bar, speed placard
  inset(24, 52, 220, 484);
  label('FLAPS', 87, 84); label('PWR', 193, 84);
  inset(60, 106, 54, 130, '#0e1013');
  ['UP', '1', '2'].forEach((t, i) => label(t, 136, 125 + i * 44, 14, '#8d949e'));
  inset(166, 106, 54, 136, '#0e1013');
  label('FUEL', 134, 282, 13, '#8d949e');
  inset(44, 300, 180, 24, '#0e1013');
  inset(44, 356, 180, 150, '#e9e2c8');
  ['K-7 KESTREL', 'ROTATE 55 KT', 'APPROACH 65 KT', 'STALL 48 KT', 'VNE 170 KT'].forEach((t, i) => label(t, 134, 376 + i * 28, i ? 14 : 16, '#22262b'));
  // right bay: radio stack
  inset(1036, 52, 220, 484);
  const radio = (y, name, value, color) => {
    inset(1050, y, 192, 62, '#0b0d10');
    label(name, 1088, y + 14, 13, '#8d949e');
    g.font = '700 30px Consolas, "Courier New", monospace'; g.textAlign = 'right'; g.fillStyle = color;
    if (value) g.fillText(value, 1236, y + 38);
  };
  radio(96, 'COM 1', '122.80', '#ffb347');
  radio(174, 'NAV 1', '113.90', '#ffb347');
  radio(252, 'HDG', '', '#ffb347');
  radio(330, 'ALT FT', '', '#ffb347');
  radio(408, 'XPDR', '1200', '#3fcf5a');
  label('K7-ISL', 1146, 504, 18, '#e8ecf2');
  label('AVIONICS', 1146, 74, 13, '#8d949e');
  // toggle row along the bottom
  inset(24, 552, 1232, 76);
  ['MASTER', 'AVIONICS', 'FUEL PUMP', 'PITOT HT', 'NAV LT', 'STROBE', 'LAND LT', 'PANEL LT'].forEach((t, i) => {
    const x = 108 + i * 152, on = i !== 3;
    g.fillStyle = '#0e1013'; g.beginPath(); g.arc(x, 580, 13, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c9ced6'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, 580); g.lineTo(x, 580 + (on ? -15 : 13)); g.stroke();
    g.fillStyle = on ? '#3fcf5a' : '#30343a'; g.fillRect(x + 24, 572, 10, 10);
    label(t, x, 612, 13);
  });
  return c;
}
