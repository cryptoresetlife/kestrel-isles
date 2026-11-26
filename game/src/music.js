// A gentle generative theme for the menus: warm pad chords under a plucked arpeggio, written for this game.

const CHORDS = [
  [57, 64, 69, 72], // Am(add9) colour
  [53, 60, 65, 69], // F
  [48, 55, 64, 67], // C
  [55, 62, 67, 71], // G
];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class MenuMusic {
  constructor(audio) { this.audio = audio; this.playing = false; this.step = 0; this.timer = null; }

  start() {
    const a = this.audio;
    if (!a.ready || this.playing) return;
    this.playing = true;
    this.bus = a.ctx.createGain();
    this.bus.gain.value = 0.0001;
    this.bus.gain.exponentialRampToValueAtTime(0.5, a.ctx.currentTime + 2);
    const verb = a.ctx.createDelay(1); verb.delayTime.value = 0.33;
    const fb = a.ctx.createGain(); fb.gain.value = 0.35;
    verb.connect(fb); fb.connect(verb);
    this.bus.connect(a.master); this.bus.connect(verb); verb.connect(a.master);
    this.next = a.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 100);
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    const t = this.audio.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(0.0001, t, 0.3);
    const bus = this.bus;
    setTimeout(() => bus.disconnect(), 1500);
  }

  voice(freq, t, dur, gain, type) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = type === 'triangle' ? 2400 : 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + (type === 'triangle' ? 0.01 : 0.8));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.bus);
    o.start(t); o.stop(t + dur + 0.1);
  }

  schedule() {
    const ctx = this.audio.ctx;
    const beat = 0.42;
    while (this.next < ctx.currentTime + 0.4) {
      const bar = Math.floor(this.step / 8) % CHORDS.length;
      const chord = CHORDS[bar];
      const i = this.step % 8;
      if (i === 0) for (const n of chord) this.voice(midi(n - 12), this.next, beat * 8.5, 0.03, 'sawtooth');
      const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
      const note = chord[pattern[i]] + (i >= 4 ? 12 : 0);
      if (i !== 5 || bar % 2 === 0) this.voice(midi(note), this.next, beat * 2.2, 0.05, 'triangle');
      this.next += beat;
      this.step++;
    }
  }
}
