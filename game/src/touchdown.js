// Reads a ground contact and says what happened: a greaser, a firm arrival, or a crash and its cause.
import { MS_TO_KT } from './flightModel.js';

export const FPM = 196.85;

const GRADES = [
  { max: 140, grade: 'butter', text: 'Greased it!', damage: 0 },
  { max: 320, grade: 'smooth', text: 'Smooth landing', damage: 0 },
  { max: 620, grade: 'firm', text: 'Firm arrival', damage: 6 },
  { max: 950, grade: 'hard', text: 'Hard landing — check the gear', damage: 28 },
];

/** Judges a touchdown event from the flight model. Returns { crash, reason } or { grade, text, damage, fpm }. */
export function judgeTouchdown(ev) {
  const fpm = Math.round(-ev.vs * FPM);
  const kt = Math.round(ev.speed * MS_TO_KT);
  const k = ev.ground.kind;
  if (k === 'water') return { crash: true, reason: kt > 25 ? `Ditched in the sea at ${kt} kt` : 'Settled into the sea', fpm, kt };
  if (k === 'rough' && kt > 22) return { crash: true, reason: kt > 70 ? `Flew into the hillside at ${kt} kt` : `Touched down on a rocky slope at ${kt} kt`, fpm, kt };
  if (fpm > 950 || (kt > 60 && fpm > 700 && k !== 'runway')) {
    return { crash: true, reason: fpm > 2500 ? `Hit the ground descending at ${fpm.toLocaleString()} ft/min` : `Gear collapsed — touched down at ${fpm} ft/min`, fpm, kt };
  }
  if (!ev.gearDown && kt > 15) return { crash: true, reason: 'Belly landing — the gear was still up', fpm, kt };
  if (Math.abs(ev.bank) > 13) return { crash: true, reason: `Wingtip strike at ${Math.round(Math.abs(ev.bank))}° of bank`, fpm, kt };
  if (ev.pitch < -5) return { crash: true, reason: 'Nose wheel first — propeller strike', fpm, kt };
  const g = GRADES.find((x) => fpm <= x.max);
  const result = { crash: false, grade: g.grade, text: g.text, damage: g.damage, fpm: Math.max(0, fpm), kt, onRunway: k === 'runway', field: ev.ground.field };
  if (ev.pitch > 13) { result.damage += 12; result.text += ' (tail strike)'; }
  if (k !== 'runway') { result.text += ' — off the runway'; result.damage += 4; }
  if (ev.ground.field && k === 'runway') {
    const { centreline } = ev;
    if (centreline !== undefined) result.centreline = centreline;
  }
  return result;
}

/** Ground roll hazards after the wheels are down: running off into the sea or rocks. */
export function judgeRollout(fm, ground) {
  const kt = fm.groundSpeed * MS_TO_KT;
  if (ground.kind === 'water' && kt > 5) return 'Rolled off the end into the sea';
  if (ground.kind === 'rough' && kt > 25) return 'Ran off into rough ground';
  return null;
}
