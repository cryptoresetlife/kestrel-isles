// Kestrel Isles: boots the world and runs the game loop, menus, sorties, landings and crashes.
import * as THREE from 'three';
import { initTerrain, buildTerrainMesh, buildSea, groundAt, meshHeightAt } from './terrain.js';
import { buildAirfields, airfieldById, headingVector, runwayWorld, AIRFIELDS } from './airfields.js';
import { buildScenery } from './scenery.js';
import { Sky } from './sky.js';
import { Aircraft } from './aircraft.js';
import { FlightModel, MS_TO_KT, M_TO_FT, K7 } from './flightModel.js';
import { CameraRig } from './cameraRig.js';
import { Cockpit } from './cockpit.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { setupTouchControls } from './touchControls.js';
import { AudioEngine } from './audio.js';
import { MenuMusic } from './music.js';
import { Effects } from './effects.js';
import { RingCourse } from './rings.js';
import { buildMissions } from './missions.js';
import { MissionRunner } from './missionRunner.js';
import { judgeTouchdown, judgeRollout, FPM } from './touchdown.js';
import { UI } from './ui.js';
import { Save } from './storage.js';
import { stageShot } from './shots.js';

const STEP = 1 / 120;
const params = new URLSearchParams(location.search);

class Game {
  constructor() {
    const canvas = document.getElementById('world');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 40000);

    initTerrain(7);
    this.scene.add(buildTerrainMesh(320));
    this.sea = buildSea();
    this.scene.add(this.sea.mesh);
    this.fields = buildAirfields(this.scene, meshHeightAt);
    this.scenery = buildScenery(this.scene, 7);
    this.sky = new Sky(this.scene, this.renderer);
    this.aircraft = new Aircraft();
    this.scene.add(this.aircraft.root);
    this.cockpit = new Cockpit(this.aircraft);
    this.fm = new FlightModel();
    this.rig = new CameraRig(this.camera);
    this.hud = new Hud(document.getElementById('hud'));
    this.input = new Input(canvas);
    this.touch = setupTouchControls(this.input);
    this.audio = new AudioEngine();
    this.audio.muted = Save.setting('muted', false);
    this.music = new MenuMusic(this.audio);
    this.effects = new Effects(this.scene);
    this.rings = new RingCourse(this.scene);
    this.missions = buildMissions();
    this.runner = new MissionRunner(this.rings);
    this.status = document.getElementById('status');
    this.view = 'chase';
    this.mode = 'title';
    this.clock = new THREE.Clock();
    this.acc = 0;
    this.time = 0;
    this.attractAngle = 0.6;
    this.ui = new UI(document.getElementById('ui'), this.uiActions());
    this.bindKeys();
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'flying') this.pause(); });
    const unlock = () => { this.audio.start(); if (this.mode !== 'flying') this.music.start(); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    this.sky.apply('golden');
    this.scenery.tintClouds(0xffe2c4);
    if (params.has('shot')) stageShot(this, params.get('shot'));
    else this.toTitle();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  uiActions() {
    return {
      click: () => this.audio.click(),
      title: () => this.toTitle(),
      missions: () => { this.mode = 'menu'; this.ui.missions(this.missions); this.music.start(); },
      free: () => this.launch('free'),
      controls: () => this.ui.controls('title'),
      pauseControls: () => this.ui.controls('pause'),
      pause: () => this.ui.pause(),
      toggleMute: () => { this.toggleMute(); this.ui.title(this.audio.muted); },
      brief: (id) => { this.mode = 'menu'; this.ui.brief(this.missions.find((m) => m.id === id)); },
      launch: (id) => this.launch(id),
      resume: () => this.resume(),
      restart: () => this.launch(this.mission.id),
    };
  }

  bindKeys() {
    const inp = this.input;
    inp.on('camera', () => { if (this.mode === 'flying') this.setView(this.view === 'chase' ? 'cockpit' : 'chase'); });
    inp.on('pause', () => { if (this.mode === 'flying') this.pause(); else if (this.mode === 'paused') this.resume(); });
    inp.on('restart', () => { if (this.mode === 'flying' || this.mode === 'paused' || this.mode === 'debrief') this.launch(this.mission.id); });
    inp.on('mute', () => this.toggleMute());
    inp.on('gear', () => { if (this.mode === 'flying') { this.audio.gearMotor(); if (this.fm.onGround && !inp.controls.gearDown) { inp.controls.gearDown = true; this.hud.flash('Gear locked on the ground', '', 'info', 1.5); } } });
    inp.on('mouseYoke', () => this.hud.flash(inp.mouseYoke ? 'Mouse yoke ON' : 'Mouse yoke OFF', inp.mouseYoke ? 'The cursor is your stick — centre it to fly straight' : '', 'info', 2));
  }

  toggleMute() { this.audio.setMuted(!this.audio.muted); Save.setSetting('muted', this.audio.muted); }

  onResize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  setView(v) {
    this.view = v;
    this.rig.setMode(v);
    this.cockpit.setActive(v === 'cockpit', this.aircraft);
  }

  toTitle() {
    this.mode = 'title';
    this.ui.title(this.audio.muted);
    this.sky.apply('golden');
    this.scenery.tintClouds(0xffe2c4);
    this.rings.clear();
    this.effects.clear();
    this.aircraft.root.visible = true;
    this.setView('chase');
    this.rig.setMode('orbit');
    this.rig.orbitRadius = 26; this.rig.orbitHeight = 5;
    this.fm.reset();
    this.music.start();
  }

  /** Starts a sortie from its start position. */
  launch(id) {
    const m = this.missions.find((x) => x.id === id);
    this.mission = m;
    this.music.stop();
    this.ui.hide();
    this.effects.clear();
    this.sky.apply(m.time);
    this.scenery.tintClouds(m.time === 'dusk' ? 0xc79a9a : m.time === 'golden' ? 0xffd9b8 : 0xffffff);
    const fm = this.fm;
    fm.reset();
    const s = m.start;
    const gh = s.onGround ? 1.7 : 0;
    fm.place(s.x, s.y + gh, s.z, s.heading, s.speed, 0);
    fm.onGround = !!s.onGround;
    fm.fuel = K7.fuelCap * m.fuel;
    const wd = headingVector(m.wind.from);
    fm.wind.set(-wd.x * m.wind.speed, 0, -wd.z * m.wind.speed);
    fm.gearDown = !!s.onGround;
    this.input.resetControls(!!s.onGround);
    fm.throttle = this.input.controls.throttle;
    this.runner.start(m);
    this.aircraft.root.visible = true;
    this.aircraft.gearT = fm.gearDown ? 1 : 0;
    this.setView(this.view === 'cockpit' ? 'cockpit' : 'chase');
    this.rig.snap();
    this.mode = 'flying';
    this.endTimer = 0;
    this.crashed = false;
    this.flightTime = 0;
    this.hud.messages = [];
    this.hud.flash(m.name, m.brief.split('.')[0] + '.', 'info', 4);
    this.status.textContent = `${m.name}. ${m.brief}`;
    this.audio.start();
  }

  pause() { this.mode = 'paused'; this.ui.pause(); this.audio.update({ active: false, rpm: 0, airspeed: 0 }); }
  resume() { this.ui.hide(); this.mode = 'flying'; this.clock.getDelta(); }

  /** One fixed physics step while flying, with touchdown and crash handling. */
  physicsStep(h) {
    const fm = this.fm, c = this.input.controls;
    const ev = fm.step(h, c, { groundAt });
    if (!ev || this.crashed) return;
    if (ev.type === 'touchdown') {
      const j = judgeTouchdown(ev);
      const events = [];
      this.runner.touchdown(j, fm, events);
      if (j.crash) { this.crash(j.reason, ev.ground.kind === 'water'); }
      else {
        fm.damage = Math.min(100, fm.damage + j.damage);
        const strength = Math.min(1, j.fpm / 700);
        this.effects.touchdown(fm.pos.clone().setY(fm.pos.y - 1.6), strength);
        this.audio.chirp(0.4 + strength);
        this.rig.shake = 0.15 + strength * 0.6;
        const kind = j.grade === 'butter' || j.grade === 'smooth' ? 'good' : j.grade === 'hard' ? 'bad' : 'info';
        this.hud.flash(j.text, `${j.fpm} ft/min · ${j.kt} kt${j.centreline !== undefined ? ` · ${j.centreline.toFixed(1)} m off centreline` : ''}`, kind, 3.5);
      }
      this.handleEvents(events);
    }
  }

  crash(reason, water) {
    if (this.crashed) return;
    this.crashed = true;
    const fm = this.fm;
    const events = [];
    this.runner.finish(false, reason, events);
    if (water) { this.effects.splash(fm.pos.clone().setY(0.5)); this.audio.splash(); }
    else { this.effects.explosion(fm.pos.clone(), fm.vel.clone()); this.audio.crash(); }
    this.aircraft.root.visible = false;
    fm.vel.set(0, 0, 0);
    fm.engineOn = false;
    this.rig.setMode('orbit');
    this.rig.orbitRadius = 45; this.rig.orbitHeight = 14;
    this.rig.shake = 1.5;
    this.hud.flash('CRASHED', reason, 'bad', 4);
    this.endTimer = 4;
    this.handleEvents(events);
  }

  handleEvents(events) {
    for (const e of events) {
      if (e.type === 'ring') {
        this.audio.ringChime(e.n);
        this.effects.sparks(e.pos, 0xffc23a);
        const quality = e.off < 5 ? 'Bullseye!' : e.off < 12 ? 'Clean pass' : 'Through';
        this.hud.flash(`RING ${e.n}/${e.total}`, quality, 'ring', 1.8);
      } else if (e.type === 'miss') {
        this.audio.missChime();
        this.hud.flash('Missed the ring', 'Turn back and fly through it', 'bad', 2.2);
      } else if (e.type === 'step') {
        this.hud.flash(e.text, e.sub, 'good', 2.5);
      } else if (e.type === 'warn') {
        this.audio.warning();
        this.hud.flash(e.text, e.sub, 'bad', 3);
      } else if (e.type === 'complete') {
        this.audio.success();
        this.hud.flash('SORTIE COMPLETE', '', 'good', 3);
        this.endTimer = 2.8;
        this.rig.setMode('orbit'); this.rig.orbitRadius = 24; this.rig.orbitHeight = 4;
      } else if (e.type === 'failed' && !this.crashed) {
        this.hud.flash('SORTIE FAILED', e.result.reason, 'bad', 3.5);
        this.endTimer = 3.5;
      }
    }
  }

  showDebrief() {
    const r = this.runner.result;
    r.fuel = this.fm.fuel / K7.fuelCap;
    r.damage = this.fm.damage;
    if (r.success && r.medal) r.newBest = Save.submit(this.mission.id, r);
    const list = this.missions.filter((m) => m.id !== 'free');
    const idx = list.findIndex((m) => m.id === this.mission.id);
    const next = r.success ? list[idx + 1] : null;
    this.mode = 'debrief';
    this.ui.debrief(this.mission, r, next);
    this.status.textContent = r.success ? `Sortie complete. Medal ${r.medal || 'none'}.` : `Sortie failed. ${r.reason}`;
  }

  /** Scripted circling flight behind the title screen. */
  attract(dt) {
    this.attractAngle += dt * 0.055;
    const a = this.attractAngle, R = 700, cx = -300, cz = 1300;
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    const y = 230 + Math.sin(a * 2) * 20;
    const hdg = THREE.MathUtils.radToDeg(Math.atan2(-Math.sin(a), Math.cos(a))) + 0;
    this.fm.pos.set(x, y, z);
    // tangent direction of travel for increasing angle
    const tx = -Math.sin(a), tz = Math.cos(a);
    const heading = (THREE.MathUtils.radToDeg(Math.atan2(tx, -tz)) + 360) % 360;
    this.fm.quat.setFromEuler(new THREE.Euler(0.04, -THREE.MathUtils.degToRad(heading), -0.32, 'YXZ'));
    this.fm.vel.set(tx * 60, 0, tz * 60);
    this.fm.rpm = 0.85; this.fm.gearDown = false; this.fm.flaps = 0;
    void hdg;
  }

  hudState() {
    const fm = this.fm, c = this.input.controls, r = this.runner;
    const target = this.mode === 'flying' ? r.target(fm) : null;
    let bearing = null;
    if (target) bearing = (THREE.MathUtils.radToDeg(Math.atan2(target.pos.x - fm.pos.x, -(target.pos.z - fm.pos.z))) + 360) % 360;
    const radarPoints = [];
    for (const rr of this.rings.rings) if (!rr.passed) radarPoints.push({ x: rr.pos.x, z: rr.pos.z, color: rr === this.rings.current ? '#ffc23a' : '#56e0ff', size: rr === this.rings.current ? 4.5 : 3 });
    for (const id of ['harbor', 'ridge', 'light']) { const af = airfieldById(id); radarPoints.push({ x: af.x, z: af.z, color: '#ffffff', size: 3 }); }
    const velDir = fm.vel.lengthSq() > 1 ? fm.vel.clone().normalize() : new THREE.Vector3(0, 0, -1).applyQuaternion(fm.quat);
    const ftAgl = fm.agl * M_TO_FT;
    let runwayCue = null;
    if (this.mode === 'flying' && !fm.onGround) {
      const next = r.mission ? r.mission.steps.slice(r.stepIndex).find((st) => st.type === 'land') : null;
      const dist = (a) => Math.hypot(a.x - fm.pos.x, a.z - fm.pos.z);
      const af = next ? airfieldById(next.field) : AIRFIELDS.reduce((b, a) => (dist(a) < dist(b) ? a : b));
      if (dist(af) < 6000) {
        const corners = [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([u, v]) => {
          const p = runwayWorld(af, u * af.length / 2, v * af.width / 2);
          return new THREE.Vector3(p.x, af.elevation + 0.3, p.z);
        });
        runwayCue = { corners, label: `RWY ${String(Math.round(af.heading / 10) % 36 || 36).padStart(2, '0')} · ${af.short}` };
      }
    }
    const sinking = fm.vs < -8 && ftAgl < 400 && !fm.onGround;
    return {
      kt: fm.airspeed * MS_TO_KT, gs: fm.groundSpeed * MS_TO_KT, ft: fm.pos.y * M_TO_FT - (fm.gearDown ? 5.6 : 2.4), aglFt: ftAgl,
      fpm: fm.vs * FPM, hdg: fm.heading, pitch: fm.pitchDeg, bank: fm.bankDeg, rpm: fm.rpm, fuel: fm.fuel / K7.fuelCap, blink: Math.floor(this.time * 3) % 2 === 0,
      throttle: c.throttle, flaps: fm.flaps, gearDown: fm.gearDown && this.aircraft.gearT > 0.98, gearMoving: this.aircraft.gearT > 0.02 && this.aircraft.gearT < 0.98,
      brake: c.brake, stall: fm.stall || (fm.alpha > 0.22 && !fm.onGround && fm.airspeed > 10), engineOn: fm.engineOn, overspeed: fm.airspeed > K7.vne, damage: fm.damage,
      pullUp: sinking, view: this.view, speed: fm.airspeed, pos: fm.pos, velDir, bug: bearing, bearing,
      target, runwayCue, showTargets: this.mode === 'flying', missionName: this.mission ? this.mission.name : '', objective: r.mission ? r.objectiveText() : '',
      objectives: r.mission ? r.checklist() : [], timer: r.mission && r.mission.par ? r.elapsed : null, radarPoints,
      hint: this.mode === 'flying' && this.flightTime < 9 && this.mission.start.onGround ? 'Hold Shift for full throttle · at 55 kt ease back on S to lift off\nC switches chase / cockpit view · drag the mouse to fly with it' : null,
    };
  }

  frame() {
    let dt = Math.min(0.05, this.clock.getDelta());
    if (this.fixedDt) dt = this.fixedDt;
    this.time += dt;
    const fm = this.fm;
    if (this.mode === 'flying') {
      this.flightTime += dt;
      const c = this.input.update(dt);
      this.touch.sync(c.throttle);
      if (!this.crashed) {
        this.acc += dt;
        while (this.acc >= STEP) { this.physicsStep(STEP); this.acc -= STEP; if (this.crashed) break; }
        const g = groundAt(fm.pos.x, fm.pos.z);
        if (fm.onGround && !this.crashed) {
          const roll = judgeRollout(fm, g);
          if (roll) this.crash(roll, g.kind === 'water');
        }
        if (!this.crashed) this.handleEvents(this.runner.update(dt, fm, c));
        if (!this.crashed && (fm.damage > 35 || !fm.engineOn) && Math.random() < dt * (fm.damage > 60 ? 30 : 12)) {
          this.effects.smoke(new THREE.Vector3(0, 0, -2.2).applyQuaternion(fm.quat).add(fm.pos), fm.vel, fm.damage > 60);
        }
        if (fm.gearDown !== c.gearDown && !fm.onGround) fm.gearDown = c.gearDown;
      }
      if (this.endTimer > 0) {
        this.endTimer -= dt;
        if (this.endTimer <= 0) this.showDebrief();
      }
    } else if (this.mode === 'title' || this.mode === 'menu') {
      this.attract(dt);
    }
    this.aircraft.sync(fm, this.mode === 'flying' ? this.input.controls : { pitch: 0, roll: -0.15, yaw: 0 }, dt);
    if (this.view === 'cockpit' && this.mode === 'flying') this.cockpit.update(this.hudState(), this.input.controls);
    this.rig.update(dt, fm, this.cockpit, (x, z) => Math.max(0, meshHeightAt(x, z)));
    this.sky.update(this.camera, fm.pos);
    this.sea.uniforms.uTime.value = this.time;
    this.sea.uniforms.uSunDir.value.copy(this.sky.sunDir);
    this.sea.uniforms.uSky.value.copy(this.sky.uniforms.uHorizon.value);
    this.sea.uniforms.uSunColor.value.copy(this.sky.uniforms.uSunColor.value);
    this.sea.uniforms.uLight.value = Math.min(1, this.sky.preset.hemi ** 2);
    this.scenery.update(this.time);
    this.rings.update(this.time);
    this.effects.update(dt, groundAt);
    const fieldSock = airfieldById('harbor').windsock;
    if (fieldSock) fieldSock.rotation.x = Math.sin(this.time * 2) * 0.05;
    this.audio.update({
      active: this.mode === 'flying' || this.mode === 'debrief' ? !this.crashed : this.mode === 'title' || this.mode === 'menu' ? 0 : 0,
      rpm: fm.rpm, engineOn: fm.engineOn, airspeed: fm.airspeed, stallWarn: this.mode === 'flying' && (fm.stall || (fm.alpha > 0.2 && !fm.onGround && fm.airspeed > 10)),
      onGround: fm.onGround, groundSpeed: fm.groundSpeed, surface: groundAt(fm.pos.x, fm.pos.z).kind,
    });
    this.renderer.render(this.scene, this.camera);
    if (this.mode === 'flying' || this.mode === 'paused' || this.shotHud) this.hud.draw(this.hudState(), this.camera, this.mode === 'paused' ? 0 : dt);
    else this.hud.clear();
  }
}

window.addEventListener('error', (e) => { const s = document.getElementById('status'); if (s) s.textContent = `Error: ${e.message}`; });
window.game = new Game();
