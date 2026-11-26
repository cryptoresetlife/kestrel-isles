// The K-7 Kestrel: a two-seat low-wing bush plane built from primitives, with moving control surfaces.
import * as THREE from 'three';

/** Fuselage outline as [radius, station] pairs from tail (-) to nose (+). */
export const FUSELAGE_PROFILE = [
  [0.0, -4.6], [0.16, -4.5], [0.3, -3.6], [0.45, -2.4], [0.6, -1.2], [0.68, -0.2], [0.7, 0.8], [0.68, 1.6], [0.6, 2.3], [0.5, 2.75], [0.0, 2.8],
];

const LIVERY = { body: 0xf1ece0, stripe: 0xe8742a, accent: 0x1d7f86, metal: 0x9aa3ab, dark: 0x23272c, tyre: 0x1b1b1b };

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.15, ...opts });
}

/** A wing panel tapered from root to tip; span runs along +X when side = 1. */
function wingPanel(span, rootChord, tipChord, thick, side) {
  const g = new THREE.BoxGeometry(span, thick, rootChord, 6, 1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + span / 2; // 0 at root .. span at tip
    const t = x / span;
    const chord = rootChord + (tipChord - rootChord) * t;
    const z = p.getZ(i) / rootChord * chord - (rootChord - chord) * 0.25;
    const y = p.getY(i) * (1 - 0.5 * t);
    p.setXYZ(i, x * side, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** A control surface hinged on its front edge, so rotating the returned pivot deflects it. */
function hinged(geo, material, hingeAt) {
  const pivot = new THREE.Group();
  pivot.position.copy(hingeAt);
  const m = new THREE.Mesh(geo, material);
  pivot.add(m);
  return { pivot, mesh: m };
}

export class Aircraft {
  constructor() {
    this.root = new THREE.Group();
    this.exterior = new THREE.Group();
    this.root.add(this.exterior);
    const body = mat(LIVERY.body), stripe = mat(LIVERY.stripe), accent = mat(LIVERY.accent);
    const metal = mat(LIVERY.metal, { metalness: 0.7, roughness: 0.3 }), dark = mat(LIVERY.dark), tyre = mat(LIVERY.tyre, { roughness: 0.9 });

    // fuselage: a lathe from the tail cone to the cowling, laid along -Z (forward)
    const prof = FUSELAGE_PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
    const fuseGeo = new THREE.LatheGeometry(prof, 24);
    fuseGeo.rotateX(-Math.PI / 2);
    fuseGeo.scale(0.92, 1, 1);
    const fuselage = new THREE.Mesh(fuseGeo, body);
    this.fuselage = fuselage;
    this.exterior.add(fuselage);

    // cheat line stripes down each side
    this.sideStripes = [];
    for (const side of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 5.6), stripe);
      s.position.set(side * 0.62, 0.05, -0.2);
      s.rotation.y = side * -0.035;
      const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 5.2), accent);
      s2.position.set(side * 0.62, -0.1, -0.1);
      this.exterior.add(s, s2);
      this.sideStripes.push(s, s2);
    }

    // cowling, exhaust stubs and spinner
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 0.9, 24, 1, true), stripe);
    cowl.rotation.x = Math.PI / 2; cowl.position.z = -2.45;
    const intake = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), dark);
    intake.position.z = -2.86; intake.rotation.y = Math.PI;
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 16), metal);
    spinner.rotation.x = -Math.PI / 2; spinner.position.z = -3.1;
    for (const side of [-1, 1]) {
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 8), dark);
      ex.rotation.z = Math.PI / 2; ex.position.set(side * 0.62, -0.25, -2.2);
      this.exterior.add(ex);
    }
    this.exterior.add(cowl, intake, spinner);

    // propeller: blades plus a blur disc that takes over at speed
    this.prop = new THREE.Group();
    this.prop.position.z = -3.0;
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.85, 0.05), dark);
      blade.position.y = 0.95; blade.rotation.y = 0.35;
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.18, 0.055), mat(0xf4c430));
      tip.position.y = 1.78; tip.rotation.y = 0.35;
      const arm = new THREE.Group();
      arm.add(blade, tip); arm.rotation.z = i * Math.PI;
      this.prop.add(arm);
    }
    this.propDisc = new THREE.Mesh(new THREE.CircleGeometry(1.9, 32), new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
    this.propDisc.position.z = -3.02;
    this.exterior.add(this.prop, this.propDisc);

    // canopy and pilot
    const canopyGeo = new THREE.SphereGeometry(0.62, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    canopyGeo.scale(0.85, 0.75, 2.4);
    this.canopy = new THREE.Mesh(canopyGeo, new THREE.MeshPhysicalMaterial({ color: 0x9fc6d8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45, clearcoat: 1 }));
    this.canopy.position.set(0, 0.5, -0.1);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 6, 20, Math.PI), dark);
    frame.position.set(0, 0.5, -0.35);
    this.canopyFrame = frame;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), mat(0xe8e2d0));
    helmet.position.set(0, 0.8, 0.15);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6, -Math.PI * 0.4, Math.PI * 0.8, Math.PI * 0.35, Math.PI * 0.3), mat(0x1a2a3a, { metalness: 0.8, roughness: 0.15 }));
    visor.position.set(0, 0.8, 0.1); visor.rotation.y = Math.PI;
    this.exterior.add(this.canopy, frame, helmet, visor);

    // wings with dihedral, wingtip stripes and nav lights
    this.ailerons = [];
    this.flaps = [];
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(side * 0.45, -0.32, -0.25);
      wing.rotation.z = side * THREE.MathUtils.degToRad(5);
      const panel = new THREE.Mesh(wingPanel(5.3, 1.75, 1.05, 0.2, side), body);
      wing.add(panel);
      const tipStripe = new THREE.Mesh(wingPanel(0.45, 1.14, 1.05, 0.205, side), stripe);
      tipStripe.position.x = side * 4.85;
      tipStripe.position.z = -0.17;
      wing.add(tipStripe);
      const ail = hinged(new THREE.BoxGeometry(2.1, 0.07, 0.42).translate(0, 0, 0.21), accent, new THREE.Vector3(side * 3.75, 0, 0.36));
      wing.add(ail.pivot);
      this.ailerons.push({ pivot: ail.pivot, side });
      const flap = hinged(new THREE.BoxGeometry(2.0, 0.07, 0.42).translate(0, 0, 0.21), body, new THREE.Vector3(side * 1.6, -0.02, 0.56));
      wing.add(flap.pivot);
      this.flaps.push(flap.pivot);
      const nav = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff2a2a : 0x2aff5a }));
      nav.position.set(side * 5.32, 0.02, -0.25);
      wing.add(nav);
      this.exterior.add(wing);
    }

    // tail: stabiliser, elevator, fin, rudder
    const stab = new THREE.Group();
    stab.position.set(0, 0.05, 3.9);
    for (const side of [-1, 1]) stab.add(new THREE.Mesh(wingPanel(1.75, 0.9, 0.6, 0.1, side), body));
    const elev = hinged(new THREE.BoxGeometry(3.4, 0.05, 0.38).translate(0, 0, 0.19), accent, new THREE.Vector3(0, 0, 0.42));
    stab.add(elev.pivot);
    this.elevator = elev.pivot;
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0); finShape.lineTo(1.25, 0); finShape.lineTo(1.0, 1.55); finShape.lineTo(0.45, 1.6); finShape.lineTo(-0.6, 0.15); finShape.closePath();
    const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.09, bevelEnabled: false });
    finGeo.translate(0, 0, -0.045); finGeo.rotateY(-Math.PI / 2);
    const fin = new THREE.Mesh(finGeo, stripe);
    fin.position.set(0, 0.2, 3.2);
    const rud = hinged(new THREE.BoxGeometry(0.07, 1.45, 0.42).translate(0, 0.72, 0.21), accent, new THREE.Vector3(0, 0.25, 4.43));
    this.rudder = rud.pivot;
    this.strobe = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.strobe.position.set(0, 1.83, 4.0);
    this.exterior.add(stab, fin, rud.pivot, this.strobe);

    // landing gear: tricycle, retracting by scaling into the wells
    this.gear = new THREE.Group();
    const strutGeo = new THREE.CylinderGeometry(0.05, 0.06, 1.1, 8);
    const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.18, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const legs = [[-1.25, -0.4, 0.1], [1.25, -0.4, 0.1], [0, -0.45, -1.9]];
    for (const [x, y, z] of legs) {
      const leg = new THREE.Group();
      leg.position.set(x, y, z);
      const strut = new THREE.Mesh(strutGeo, metal); strut.position.y = -0.5;
      const wheel = new THREE.Mesh(wheelGeo, tyre); wheel.position.y = -1.0;
      const fairing = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6), body); fairing.scale.set(0.6, 0.75, 1.5); fairing.position.y = -0.95;
      leg.add(strut, wheel, fairing);
      this.gear.add(leg);
    }
    this.exterior.add(this.gear);
    this.gearT = 1;

    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.propDisc.castShadow = false;
    this.canopy.castShadow = false;
    this.time = 0;
    // Distance from the fuselage centreline down to the bottom of the wheels
    this.gearHeight = 1.73;
  }

  /** Moves the model to the flight model's state and animates surfaces, prop and gear. */
  sync(fm, controls, dt) {
    this.time += dt;
    this.root.position.copy(fm.pos);
    this.root.quaternion.copy(fm.quat);
    const ail = THREE.MathUtils.degToRad(20) * controls.roll;
    for (const a of this.ailerons) a.pivot.rotation.x = a.side * ail;
    this.elevator.rotation.x = -THREE.MathUtils.degToRad(22) * controls.pitch;
    this.rudder.rotation.y = -THREE.MathUtils.degToRad(25) * controls.yaw;
    const flapDeg = [0, 15, 32][fm.flaps] || 0;
    for (const f of this.flaps) f.rotation.x += (THREE.MathUtils.degToRad(flapDeg) - f.rotation.x) * Math.min(1, dt * 2);
    const spin = fm.rpm * 45;
    this.prop.rotation.z -= spin * dt;
    const blur = THREE.MathUtils.clamp((fm.rpm - 0.25) * 1.6, 0, 1);
    this.propDisc.material.opacity = blur * 0.12;
    this.prop.visible = blur < (this.inCockpit ? 0.05 : 0.9) || (!this.inCockpit && Math.floor(this.time * 60) % 3 === 0);
    const target = fm.gearDown ? 1 : 0;
    this.gearT += Math.sign(target - this.gearT) * Math.min(Math.abs(target - this.gearT), dt * 0.7);
    this.gear.scale.y = Math.max(0.05, this.gearT);
    this.gear.visible = this.gearT > 0.06;
    this.strobe.visible = Math.floor(this.time * 1.2 % 1 * 10) === 0;
  }
}
