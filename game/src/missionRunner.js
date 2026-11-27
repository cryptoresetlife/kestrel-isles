// Runs one sortie: tracks its steps, rings, cargo drops, timer and landing, and decides success or failure.
import * as THREE from 'three';
import { airfieldById, runwayLocal, runwayWorld } from './airfields.js';
import { medalFor } from './missions.js';
import { heightAt } from './terrain.js';

export class MissionRunner {
  constructor(rings, cargo) {
    this.rings = rings;
    this.cargo = cargo;
    this.mission = null;
  }

  start(mission) {
    this.mission = mission;
    this.stepIndex = 0;
    this.elapsed = 0;
    this.clockRunning = !mission.start.onGround;
    this.state = 'flying';
    this.landing = null;
    this.bestLanding = null;
    this.result = null;
    this.ringsPassed = 0;
    this.ringsTotal = mission.steps.filter((s) => s.type === 'rings').reduce((n, s) => n + s.points.length, 0);
    this.prevPos = null;
    this.dropMiss = null;
    this.cargo.clear();
    this.enterStep();
  }

  get step() { return this.mission.steps[this.stepIndex]; }

  enterStep() {
    const st = this.step;
    if (st && st.type === 'rings') this.rings.build(st.points, this.prevPos || this.mission.start);
    else this.rings.clear();
    if (st && st.type === 'drop') this.cargo.setZone(st, heightAt);
    else this.cargo.clearZone();
  }

  advance(events) {
    this.stepIndex++;
    if (this.stepIndex >= this.mission.steps.length) this.finish(true, null, events);
    else this.enterStep();
  }

  finish(success, reason, events) {
    if (this.state !== 'flying') return;
    this.state = success ? 'complete' : 'failed';
    const medal = success ? medalFor(this.mission, this.elapsed, this.bestLanding) : null;
    this.result = { success, reason, time: this.elapsed, landing: this.bestLanding, medal, rings: this.ringsPassed, ringsTotal: this.ringsTotal, dropMiss: this.dropMiss };
    events.push({ type: success ? 'complete' : 'failed', result: this.result });
  }

  /** Per-frame update; returns events for main to show and sound. */
  update(dt, fm, controls) {
    const events = [];
    if (this.state !== 'flying') return events;
    if (!this.clockRunning && (controls.throttle > 0.05 || fm.groundSpeed > 1)) this.clockRunning = true;
    if (this.clockRunning) this.elapsed += dt;
    const st = this.step;
    const pos = fm.pos.clone();
    if (st && st.type === 'takeoff' && !fm.onGround && fm.agl > 12) { events.push({ type: 'step', text: 'Airborne', sub: 'Gear up (G) and follow the rings' }); this.advance(events); }
    if (st && st.type === 'rings' && this.prevPos) {
      const r = this.rings.check(this.prevPos, pos);
      if (r && r.result === 'pass') {
        this.ringsPassed++;
        events.push({ type: 'ring', n: this.ringsPassed, total: this.ringsTotal, off: r.off, pos: r.ring.pos });
        if (this.rings.done) this.advance(events);
      } else if (r && r.result === 'miss') {
        events.push({ type: 'miss' });
      }
    }
    if (st && st.type === 'land' && this.landing && fm.onGround && fm.groundSpeed < 2.5) {
      if (this.landing.field && this.landing.field.id === st.field && this.landing.onRunway) {
        events.push({ type: 'stopped' });
        this.advance(events);
      }
    }
    if (fm.damage >= 100) this.finish(false, 'Airframe failure — the Kestrel was overstressed', events);
    if (!fm.engineOn && fm.onGround && fm.groundSpeed < 1 && this.state === 'flying' && st && st.type !== 'free') {
      this.finish(false, 'Out of fuel — forced landing short of the field', events);
    }
    if (Math.abs(fm.pos.x) > 5800 || Math.abs(fm.pos.z) > 5800) {
      if (!this.boundsWarned) { events.push({ type: 'warn', text: 'Leaving the chart', sub: 'Turn back toward the islands' }); this.boundsWarned = true; }
      if (Math.abs(fm.pos.x) > 7000 || Math.abs(fm.pos.z) > 7000) this.finish(false, 'Flew off the chart into open ocean', events);
    } else this.boundsWarned = false;
    this.prevPos = pos;
    return events;
  }

  /** Called when a released sack reaches the ground: a hit inside the zone completes the drop step. */
  sackLanded(l, events) {
    const st = this.step;
    if (this.state !== 'flying' || !st || st.type !== 'drop') return;
    if (l.hit) {
      this.dropMiss = l.miss;
      events.push({ type: 'delivered', miss: l.miss, cargo: st.cargo, pos: l.pos });
      this.advance(events);
    } else {
      events.push({ type: 'dropMiss', miss: l.miss, left: this.cargo.left, water: l.water });
      if (this.cargo.left <= 0 && !this.cargo.airborne) this.finish(false, `Every ${st.cargo} missed the ${st.name}`, events);
    }
  }

  /** Called with a judged touchdown. */
  touchdown(j, fm, events) {
    if (this.state !== 'flying') return;
    if (j.crash) { this.finish(false, j.reason, events); return; }
    const st = this.step;
    if (j.field) {
      const local = runwayLocal(j.field, fm.pos.x, fm.pos.z);
      j.centreline = Math.abs(local.v);
      j.fromThreshold = local.u + j.field.length / 2;
    }
    this.landing = j;
    if (st && st.type === 'land') {
      if (j.field && j.field.id !== st.field) events.push({ type: 'warn', text: `This is ${j.field.name}`, sub: `Your destination is ${airfieldById(st.field).name}` });
      else if (j.onRunway && (!this.bestLanding || j.fpm < this.bestLanding.fpm)) this.bestLanding = j;
    }
  }

  /** What the HUD should point at next. */
  target(fm) {
    const st = this.step;
    if (this.state !== 'flying' || !st) return null;
    if (st.type === 'rings' && this.rings.current) {
      const r = this.rings.current;
      return { pos: r.pos, ring: true, up: new THREE.Vector3(0, r.radius * 1.15, 0), label: `RING ${this.ringsPassed + 1}/${this.ringsTotal}`, dist: r.pos.distanceTo(fm.pos) };
    }
    if (st.type === 'drop' && this.cargo.zone) {
      const pos = this.cargo.zone.pos.clone().setY(this.cargo.zone.pos.y + 6);
      return { pos, drop: true, label: 'DROP ZONE', dist: Math.hypot(pos.x - fm.pos.x, pos.z - fm.pos.z) };
    }
    if (st.type === 'land') {
      const af = airfieldById(st.field);
      const p = runwayWorld(af, -af.length / 2, 0);
      const pos = new THREE.Vector3(p.x, af.elevation + 2, p.z);
      return { pos, label: `${af.short} RWY ${String(Math.round(af.heading / 10)).padStart(2, '0')}`, dist: pos.distanceTo(fm.pos) };
    }
    return null;
  }

  objectiveText() {
    const st = this.step;
    if (this.state === 'complete') return 'Sortie complete';
    if (this.state === 'failed') return 'Sortie failed';
    if (!st) return '';
    if (st.type === 'takeoff') return 'Take off — full throttle, rotate at 55 kt';
    if (st.type === 'rings') return `Fly through ring ${this.ringsPassed + 1} of ${this.ringsTotal}`;
    if (st.type === 'drop') return `Drop the ${st.cargo} — Space`;
    if (st.type === 'land') { const af = airfieldById(st.field); return this.landing && this.landing.field === af ? `Brake to a stop on ${af.short}` : `Land at ${af.name}`; }
    return 'Free flight — explore the islands';
  }

  checklist() {
    return this.mission.steps.filter((s) => s.type !== 'free').map((s, i) => {
      let text = s.type === 'takeoff' ? 'Take off' : s.type === 'drop' ? `Drop the ${s.cargo}` : s.type === 'rings' ? `Rings ${i < this.stepIndex ? s.points.length : (this.step === s ? this.rings.index : 0)}/${s.points.length}` : `Land at ${airfieldById(s.field).name}`;
      return { text, done: i < this.stepIndex };
    });
  }
}
