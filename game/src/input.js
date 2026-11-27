// Keyboard and mouse flight controls, turned into smoothed stick, rudder and throttle values.

const KEY_ACTIONS = {
  KeyG: 'gear', KeyF: 'flapsDown', KeyV: 'flapsUp', KeyC: 'camera', KeyP: 'pause', Escape: 'pause',
  KeyR: 'restart', KeyM: 'mouseYoke', KeyN: 'mute', KeyH: 'help', Enter: 'confirm', Space: 'drop', KeyX: 'drop',
};

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, flaps: 0, gearDown: true, brake: false };
    this.handlers = {};
    this.mouseYoke = false;
    this.drag = null;
    this.mouse = { x: 0, y: 0, nx: 0, ny: 0 };
    this.touch = { active: false, x: 0, y: 0, throttle: null };
    this.wheelThrottle = 0;
    this.invertPitch = false;

    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat && KEY_ACTIONS[e.code]) this.fire(KEY_ACTIONS[e.code]);
      if (!e.repeat && /^Digit[0-9]$/.test(e.code)) {
        const d = Number(e.code.slice(5));
        this.controls.throttle = d === 0 ? 1 : d / 10;
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.mouse.nx = (e.clientX / innerWidth) * 2 - 1;
      this.mouse.ny = (e.clientY / innerHeight) * 2 - 1;
      if (this.drag) { this.drag.dx = e.clientX - this.drag.x; this.drag.dy = e.clientY - this.drag.y; }
    });
    window.addEventListener('mouseup', () => { this.drag = null; });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.controls.throttle = Math.min(1, Math.max(0, this.controls.throttle - Math.sign(e.deltaY) * 0.05));
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  on(action, fn) { this.handlers[action] = fn; }
  fire(action) {
    const c = this.controls;
    if (action === 'gear') c.gearDown = !c.gearDown;
    else if (action === 'flapsDown') c.flaps = Math.min(2, c.flaps + 1);
    else if (action === 'flapsUp') c.flaps = Math.max(0, c.flaps - 1);
    else if (action === 'flapsCycle') c.flaps = (c.flaps + 1) % 3;
    else if (action === 'mouseYoke') this.mouseYoke = !this.mouseYoke;
    if (this.handlers[action]) this.handlers[action](action);
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }

  /** Smooths keyboard axes toward their targets; mouse and touch override when used. */
  update(dt) {
    const c = this.controls;
    let tp = 0, tr = 0, ty = 0;
    if (this.down('KeyS', 'ArrowDown')) tp += 1;
    if (this.down('KeyW', 'ArrowUp')) tp -= 1;
    if (this.down('KeyD', 'ArrowRight')) tr += 1;
    if (this.down('KeyA', 'ArrowLeft')) tr -= 1;
    if (this.down('KeyE')) ty += 1;
    if (this.down('KeyQ')) ty -= 1;
    if (this.invertPitch) tp = -tp;
    let analog = false;
    if (this.drag && (Math.abs(this.drag.dx) > 3 || Math.abs(this.drag.dy) > 3)) {
      const s = Math.min(innerWidth, innerHeight) * 0.25;
      tr = clamp(this.drag.dx / s); tp = clamp(this.drag.dy / s) * (this.invertPitch ? -1 : 1);
      analog = true;
    } else if (this.mouseYoke) {
      const dz = (v) => (Math.abs(v) < 0.04 ? 0 : (v - Math.sign(v) * 0.04) / 0.96);
      tr = clamp(dz(this.mouse.nx) * 1.6); tp = clamp(dz(this.mouse.ny) * 1.8) * (this.invertPitch ? -1 : 1);
      analog = true;
    }
    if (this.touch.active) { tr = clamp(this.touch.x); tp = clamp(this.touch.y); analog = true; }
    const rate = (cur, tgt, up, back) => {
      const r = (Math.abs(tgt) > Math.abs(cur) && Math.sign(tgt) === Math.sign(cur || tgt) ? up : back) * dt;
      return cur + Math.max(-r, Math.min(r, tgt - cur));
    };
    if (analog) { c.pitch += (tp - c.pitch) * Math.min(1, dt * 12); c.roll += (tr - c.roll) * Math.min(1, dt * 12); }
    else { c.pitch = rate(c.pitch, tp, 2.6, 5); c.roll = rate(c.roll, tr, 3.2, 6); }
    c.yaw = rate(c.yaw, ty, 3, 5);
    if (this.down('ShiftLeft', 'ShiftRight', 'Equal', 'NumpadAdd', 'PageUp')) c.throttle = Math.min(1, c.throttle + dt * 0.55);
    if (this.down('KeyZ', 'Minus', 'NumpadSubtract', 'PageDown')) c.throttle = Math.max(0, c.throttle - dt * 0.55);
    if (this.touch.throttle !== null) c.throttle = this.touch.throttle;
    c.brake = this.down('KeyB') || !!this.touch.brake;
    return c;
  }

  resetControls(onGround) {
    Object.assign(this.controls, { pitch: 0, roll: 0, yaw: 0, throttle: onGround ? 0 : 0.72, flaps: 0, gearDown: onGround, brake: false });
  }
}

function clamp(v) { return Math.max(-1, Math.min(1, v)); }
