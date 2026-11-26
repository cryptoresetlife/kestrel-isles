// Screenshot staging: ?shot=<name> puts a sortie at a chosen moment, flies it for a second and flags ready.
import { airfieldById, runwayWorld } from './airfields.js';

/** Jumps a running sortie forward to step `step`, with `ringsDone` rings of it already flown. */
function skipTo(game, step, ringsDone, elapsed) {
  const r = game.runner;
  r.stepIndex = step;
  r.enterStep();
  for (let i = 0; i < ringsDone; i++) { r.rings.rings[i].passed = true; }
  r.rings.index = ringsDone;
  r.rings.refresh();
  r.ringsPassed = ringsDone + game.mission.steps.slice(0, step).filter((s) => s.type === 'rings').reduce((n, s) => n + s.points.length, 0);
  r.elapsed = elapsed;
  r.clockRunning = true;
}

function placeOnApproach(game, fieldId, u, v, height, speed, pitch = -2) {
  const af = airfieldById(fieldId);
  const p = runwayWorld(af, u, v);
  game.fm.place(p.x, af.elevation + height, p.z, af.heading, speed, pitch);
  game.fm.onGround = false;
}

const SETUPS = {
  approach(game) {
    game.launch('circuit');
    const q = new URLSearchParams(location.search);
    const u = Number(q.get('u') || -985), h = Number(q.get('h') || 47);
    if (u > -800) skipTo(game, 2, 0, 188.6); else skipTo(game, 1, 5, 171.4);
    placeOnApproach(game, 'harbor', u, -3, h, 36, -2);
    Object.assign(game.input.controls, { throttle: 0.28, flaps: 2, gearDown: true, pitch: -0.35 });
    game.fm.gearDown = true; game.aircraft.gearT = 1;
    game.fm.fuel *= 0.78;
    game.setView('chase');
  },
  cockpit(game) {
    game.launch('circuit');
    skipTo(game, 1, 5, 171.4);
    placeOnApproach(game, 'harbor', -1140, 3, 56, 36, -3);
    Object.assign(game.input.controls, { throttle: 0.25, flaps: 2, gearDown: true, pitch: -0.35 });
    game.fm.gearDown = true; game.aircraft.gearT = 1;
    game.fm.fuel *= 0.78;
    game.setView('cockpit');
  },
  valley(game) {
    game.launch('valley');
    skipTo(game, 0, 3, 63.8);
    const ring = game.rings.current.pos;
    const prev = game.rings.rings[2].pos;
    const dx = ring.x - prev.x, dz = ring.z - prev.z, d = Math.hypot(dx, dz);
    const hdg = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
    game.fm.place(ring.x - dx / d * 300 + 10, ring.y + 1, ring.z - dz / d * 300, hdg + 3, 60, 0);
    game.fm.trim = 0.0;
    Object.assign(game.input.controls, { throttle: 0.8, roll: 0.06, pitch: 0.02, gearDown: false });
    game.fm.gearDown = false; game.aircraft.gearT = 0;
    game.setView('chase');
  },
  dusk(game) {
    game.launch('dusk');
    skipTo(game, 0, 1, 142.0);
    const ring = game.rings.current.pos;
    game.fm.place(ring.x + 300, ring.y + 20, ring.z + 700, 200, 58, -1);
    Object.assign(game.input.controls, { throttle: 0.7, roll: -0.3, gearDown: false });
    game.fm.gearDown = false; game.aircraft.gearT = 0;
    game.setView('chase');
  },
  touchdown(game) {
    game.launch('mail');
    skipTo(game, 2, 0, 288.4);
    placeOnApproach(game, 'light', -330, 1, 1.9, 31, 2);
    game.fm.vel.y = -1.1;
    game.fm.trim = 0.04;
    Object.assign(game.input.controls, { throttle: 0, flaps: 2, gearDown: true, pitch: 0 });
    game.fm.gearDown = true; game.aircraft.gearT = 1;
    game.fm.fuel *= 0.35;
    game.setView('chase');
    return 'keep-banners';
  },
  menu(game) {
    game.mode = 'menu';
    game.ui.missions(game.missions);
    return 'nohud';
  },
};

export function stageShot(game, name) {
  const setup = SETUPS[name] || SETUPS.approach;
  game.fixedDt = 1 / 60;
  game.toTitle();
  const r = setup(game);
  game.shotHud = r !== 'nohud';
  // hold the staged stick and throttle instead of reading the (idle) keyboard
  game.input.update = () => game.input.controls;
  if (game.shotHud) game.hud.messages = [];
  game.flightTime = 99;
  let frames = 0;
  const wait = Number(new URLSearchParams(location.search).get('frames') || 50);
  const tick = () => {
    frames++;
    if (frames === 2 || (frames === 20 && r !== 'keep-banners')) game.hud.messages = [];
    if (frames >= wait) { window.__shotReady = true; return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
