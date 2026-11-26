// The pilot's seat: dashboard with a live instrument panel, glareshield, canopy frame and stick.
import * as THREE from 'three';
import { drawSixPack } from './instruments.js';
import { FUSELAGE_PROFILE } from './aircraft.js';

export class Cockpit {
  constructor(aircraft) {
    this.group = new THREE.Group();
    this.group.visible = false;
    aircraft.root.add(this.group);
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280; this.canvas.height = 340;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;

    const dark = new THREE.MeshLambertMaterial({ color: 0x3a3f46, emissive: 0x15181c });
    const trim = new THREE.MeshLambertMaterial({ color: 0x15171a });
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x5a6068 });
    // the nose ahead of the windscreen, seen over the glareshield
    const nosePts = [[0.69, 0.95], ...FUSELAGE_PROFILE.filter(([, y]) => y > 0.95)].map(([r, y]) => new THREE.Vector2(r, y));
    const noseGeo = new THREE.LatheGeometry(nosePts, 24);
    noseGeo.rotateX(-Math.PI / 2); noseGeo.scale(0.92, 1, 1);
    this.group.add(new THREE.Mesh(noseGeo, new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.5, metalness: 0.15 })));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.26, 0.335), new THREE.MeshBasicMaterial({ map: this.tex }));
    panel.position.set(0, 0.47, -0.74);
    panel.rotation.x = -0.12;
    const backing = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.44, 0.06), dark);
    backing.position.set(0, 0.46, -0.78); backing.rotation.x = -0.12;
    const glare = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.32), trim);
    glare.position.set(0, 0.64, -0.86);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 8), trim);
    lip.rotation.z = Math.PI / 2; lip.position.set(0, 0.655, -0.71);
    // sidewalls and the floor of the cockpit tub
    const wallGeo = new THREE.PlaneGeometry(1.8, 0.7);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(wallGeo, dark);
      wall.position.set(side * 0.58, 0.28, -0.1);
      wall.rotation.y = -side * Math.PI / 2;
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 1.8), trim);
      sill.position.set(side * 0.56, 0.6, -0.1);
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
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.42, 8), new THREE.MeshLambertMaterial({ color: 0x555b62 }));
    shaft.position.y = 0.21;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.11, 10), trim);
    grip.position.y = 0.45;
    this.stick.add(shaft, grip);
    this.stick.position.set(0, -0.02, -0.25);
    // throttle quadrant with an orange knob
    this.lever = new THREE.Group();
    const lshaft = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.16), new THREE.MeshLambertMaterial({ color: 0x666c73 }));
    lshaft.position.z = -0.08;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshLambertMaterial({ color: 0xff7a1a }));
    knob.position.z = -0.16;
    this.lever.add(lshaft, knob);
    this.lever.position.set(-0.5, 0.3, -0.32);
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
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#3a3f46'); bg.addColorStop(1, '#22262b');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    for (let x = 0; x < W; x += 6) g.fillRect(x, 0, 1, H);
    const r = 82;
    drawSixPack(g, 112, H / 2 + 6, r, state);
    // annunciators
    const lamps = [['GEAR', state.gearDown ? '#3fcf5a' : (state.gearMoving ? '#f2c230' : '#30343a')], ['FLAPS ' + state.flaps, state.flaps ? '#39e1ff' : '#30343a'], ['STALL', state.stall ? '#ff3b30' : '#30343a'], ['FUEL', state.fuel < 0.15 ? '#ff3b30' : '#30343a'], ['BRK', state.brake ? '#f2c230' : '#30343a']];
    g.font = '700 15px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lamps.forEach(([t, c], i) => {
      const x = 330 + i * 150, y = 18;
      g.fillStyle = c; g.fillRect(x - 55, y - 11, 110, 22);
      g.fillStyle = c === '#30343a' ? '#6a6f76' : '#0b0d10'; g.fillText(t, x, y + 1);
    });
    this.tex.needsUpdate = true;
    this.stick.rotation.x = -controls.pitch * 0.3;
    this.stick.rotation.z = -controls.roll * 0.3;
    this.lever.position.z = -0.32 - controls.throttle * 0.1;
  }
}
