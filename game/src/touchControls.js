// On-screen stick, throttle lever and buttons for phones and tablets.

export function setupTouchControls(input) {
  const root = document.getElementById('touch');
  const stick = document.getElementById('stick'), knob = document.getElementById('stick-knob');
  const track = document.getElementById('throttle-track'), tknob = document.getElementById('throttle-knob');
  let stickId = null, throttleId = null;

  const show = () => { root.classList.remove('hidden'); document.body.classList.add('touch'); };
  if (matchMedia('(pointer: coarse)').matches) show();
  window.addEventListener('touchstart', show, { once: true, passive: true });

  const stickMove = (t) => {
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2;
    let dx = (t.clientX - cx) / rad, dy = (t.clientY - cy) / rad;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    input.touch.x = dx; input.touch.y = dy; input.touch.active = true;
    knob.style.transform = `translate(${dx * rad * 0.6}px, ${dy * rad * 0.6}px)`;
  };
  const throttleMove = (t) => {
    const r = track.getBoundingClientRect();
    const v = 1 - Math.min(1, Math.max(0, (t.clientY - r.top) / r.height));
    input.touch.throttle = v;
    tknob.style.bottom = `${v * 100}%`;
  };

  stick.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; stickId = t.identifier; stickMove(t); }, { passive: false });
  track.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; throttleId = t.identifier; throttleMove(t); }, { passive: false });
  window.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) stickMove(t);
      if (t.identifier === throttleId) throttleMove(t);
    }
  }, { passive: true });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; input.touch.active = false; input.touch.x = input.touch.y = 0; knob.style.transform = ''; }
      if (t.identifier === throttleId) throttleId = null;
    }
  };
  window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);

  for (const b of root.querySelectorAll('button')) {
    const act = b.dataset.act;
    if (act === 'brake') {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); input.touch.brake = true; b.classList.add('on'); }, { passive: false });
      b.addEventListener('touchend', () => { input.touch.brake = false; b.classList.remove('on'); });
    } else {
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        input.fire(act === 'flaps' ? 'flapsCycle' : act);
      }, { passive: false });
      b.addEventListener('click', () => input.fire(act === 'flaps' ? 'flapsCycle' : act));
    }
  }

  return {
    /** Keeps the throttle lever in step with keyboard changes. */
    sync(throttle) { if (throttleId === null) { input.touch.throttle = null; tknob.style.bottom = `${throttle * 100}%`; } },
    setVisible(v) { root.style.display = v ? '' : 'none'; },
  };
}
