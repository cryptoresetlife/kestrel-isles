// All sound is synthesised with Web Audio: engine and prop, wind, stall horn, gear, chimes, tyres and crashes.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ready = false;
  }

  /** Must be called from a user gesture; builds the graph once. */
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(ctx.destination);

    // engine: two detuned saws and a sub square through a low-pass, amplitude-modulated by the prop
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 600; this.engFilter.Q.value = 2;
    this.osc = [];
    for (const [type, det, g] of [['sawtooth', 0, 0.35], ['sawtooth', 7, 0.25], ['square', -1200, 0.3]]) {
      const o = ctx.createOscillator(); o.type = type; o.detune.value = det;
      const gg = ctx.createGain(); gg.gain.value = g;
      o.connect(gg); gg.connect(this.engFilter); o.start();
      this.osc.push(o);
    }
    this.propLfo = ctx.createOscillator(); this.propLfo.type = 'sine';
    this.propDepth = ctx.createGain(); this.propDepth.gain.value = 0.25;
    this.propAmp = ctx.createGain(); this.propAmp.gain.value = 0.75;
    this.propLfo.connect(this.propDepth); this.propDepth.connect(this.propAmp.gain); this.propLfo.start();
    this.engFilter.connect(this.propAmp); this.propAmp.connect(this.engGain); this.engGain.connect(this.master);

    // noise bed for wind and prop wash
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * 0.08) * 0.985; d[i] = last * 3 + (Math.random() * 2 - 1) * 0.15; }
    this.noiseBuf = buf;
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true; noise.start();
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    noise.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.master);

    // stall horn
    this.horn = ctx.createOscillator(); this.horn.type = 'square'; this.horn.frequency.value = 720;
    this.hornGain = ctx.createGain(); this.hornGain.gain.value = 0;
    const hornF = ctx.createBiquadFilter(); hornF.type = 'lowpass'; hornF.frequency.value = 1800;
    this.horn.connect(hornF); hornF.connect(this.hornGain); this.hornGain.connect(this.master); this.horn.start();

    // ground rumble
    this.rumbleGain = ctx.createGain(); this.rumbleGain.gain.value = 0;
    const rumbleF = ctx.createBiquadFilter(); rumbleF.type = 'lowpass'; rumbleF.frequency.value = 140;
    const rumble = ctx.createBufferSource(); rumble.buffer = buf; rumble.loop = true; rumble.playbackRate.value = 0.5; rumble.start();
    rumble.connect(rumbleF); rumbleF.connect(this.rumbleGain); this.rumbleGain.connect(this.master);
    this.ready = true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** Called every frame with the flight state. */
  update(s) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const rpm = s.rpm;
    const base = 38 + rpm * 92;
    for (const o of this.osc) o.frequency.setTargetAtTime(base, t, 0.08);
    this.engFilter.frequency.setTargetAtTime(380 + rpm * 1500, t, 0.1);
    this.propLfo.frequency.setTargetAtTime(base / 2, t, 0.08);
    const on = s.active ? 1 : 0;
    this.engGain.gain.setTargetAtTime(on * (s.engineOn ? 0.09 + rpm * 0.16 : 0), t, 0.15);
    const v = Math.min(1, s.airspeed / 85);
    this.windGain.gain.setTargetAtTime(on * (0.015 + v * v * 0.22), t, 0.2);
    this.windFilter.frequency.setTargetAtTime(300 + v * 1400, t, 0.2);
    const hornOn = on && s.stallWarn && Math.floor(t * 4) % 2 === 0;
    this.hornGain.gain.setTargetAtTime(hornOn ? 0.06 : 0, t, 0.02);
    this.rumbleGain.gain.setTargetAtTime(on && s.onGround ? Math.min(0.5, s.groundSpeed / 30) * (s.surface === 'runway' ? 0.4 : 0.9) : 0, t, 0.05);
  }

  /** A short burst of filtered noise. */
  noiseBurst(dur, freq, gain, q = 1, type = 'bandpass') {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  tone(freq, dur, gain, type = 'sine', when = 0) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  ringChime(n) {
    const root = 523.25 * Math.pow(2, (n % 5) * 2 / 12);
    this.tone(root, 0.6, 0.18); this.tone(root * 1.5, 0.7, 0.12, 'sine', 0.07); this.tone(root * 2, 0.9, 0.08, 'triangle', 0.14);
  }
  missChime() { this.tone(220, 0.4, 0.15, 'square'); this.tone(196, 0.5, 0.12, 'square', 0.12); }
  chirp(strength) { this.noiseBurst(0.25 + strength * 0.2, 2400, 0.25 + strength * 0.3, 2); this.noiseBurst(0.2, 180, 0.4 * strength, 1, 'lowpass'); }
  crash() { this.noiseBurst(2.5, 120, 1.2, 0.7, 'lowpass'); this.noiseBurst(1.2, 900, 0.6, 0.5); this.tone(55, 1.2, 0.5, 'sawtooth'); }
  splash() { this.noiseBurst(1.6, 700, 0.9, 0.4); }
  gearMotor() { this.noiseBurst(1.6, 300, 0.12, 6); this.tone(110, 1.5, 0.05, 'sawtooth'); }
  click() { this.tone(1400, 0.05, 0.08, 'square'); }
  success() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.9, 0.14, 'triangle', i * 0.12)); }
  warning() { this.tone(880, 0.15, 0.1, 'square'); this.tone(880, 0.15, 0.1, 'square', 0.25); }
}
