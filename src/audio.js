// WebAudio sound effects plus a procedural in-ship "radio" with a few stations.

const STATIONS = [
  { name: 'RADIO OFF' },
  { name: 'NEBULA FM · synthwave', bpm: 100, root: 55, prog: [0, -4, 3, -2], third: 3, bass: 'sawtooth', lead: 'square', leadP: 0.28 },
  { name: 'VOID GROOVE · space funk', bpm: 112, root: 49, prog: [0, 0, 5, 3], third: 3, bass: 'square', lead: 'triangle', leadP: 0.35, funk: true },
  { name: 'ROCKET RADIO · chip rock', bpm: 150, root: 65.4, prog: [0, 5, 7, 5], third: 4, bass: 'square', lead: 'square', leadP: 0.45 },
];
const SCALE = [0, 3, 5, 7, 10, 12];
const semi = n => Math.pow(2, n / 12);

export class Sound {
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = (this.ctx = new C());
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.engOsc = ctx.createOscillator();
    this.engOsc.type = 'sawtooth';
    this.engOsc.frequency.value = 40;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 300;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engOsc.connect(this.engFilter).connect(this.engGain).connect(this.master);
    this.engOsc.start();

    this.sirOsc = ctx.createOscillator();
    this.sirOsc.type = 'triangle';
    this.sirGain = ctx.createGain();
    this.sirGain.gain.value = 0;
    this.sirOsc.connect(this.sirGain).connect(this.master);
    this.sirOsc.start();

    this.music = ctx.createGain();
    this.music.gain.value = 0.32;
    this.music.connect(this.master);
    this.station = 0;
    this.step = 0;
    this.nextNote = 0;
  }

  get now() { return this.ctx.currentTime; }

  tone(freq, t, dur, type, gain, dest = this.master, endFreq) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hiss(t, dur, gain, filterType, freq, dest = this.master) {
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise;
    f.type = filterType;
    f.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  zap(pitch = 1, vol = 1) {
    if (!this.ctx || vol <= 0.01) return;
    this.tone(1400 * pitch, this.now, 0.14, 'square', 0.07 * vol, this.master, 180 * pitch);
  }

  boom(vol = 1) {
    if (!this.ctx || vol <= 0.01) return;
    const t = this.now;
    this.hiss(t, 1.2, 0.8 * vol, 'lowpass', 600);
    this.tone(90, t, 0.8, 'sine', 0.6 * vol, this.master, 30);
  }

  hit() {
    if (!this.ctx) return;
    this.hiss(this.now, 0.15, 0.4, 'bandpass', 900);
  }

  coin() {
    if (!this.ctx) return;
    const t = this.now;
    this.tone(988, t, 0.1, 'square', 0.08);
    this.tone(1319, t + 0.08, 0.25, 'square', 0.08);
  }

  chime(good = true) {
    if (!this.ctx) return;
    const t = this.now;
    const notes = good ? [523, 659, 784, 1047] : [392, 330, 262, 196];
    notes.forEach((f, i) => this.tone(f, t + i * 0.12, 0.4, 'triangle', 0.15));
  }

  setEngine(level) {
    if (!this.ctx) return;
    const t = this.now;
    this.engGain.gain.setTargetAtTime(level * 0.09, t, 0.1);
    this.engOsc.frequency.setTargetAtTime(38 + level * 55, t, 0.15);
    this.engFilter.frequency.setTargetAtTime(180 + level * 900, t, 0.15);
  }

  setSiren(level) {
    if (!this.ctx) return;
    const t = this.now;
    this.sirGain.gain.setTargetAtTime(level * 0.035, t, 0.2);
    this.sirOsc.frequency.setTargetAtTime(Math.floor(t * 2.5) % 2 ? 640 : 880, t, 0.03);
  }

  nextStation() {
    if (!this.ctx) return STATIONS[0].name;
    this.station = (this.station + 1) % STATIONS.length;
    this.step = 0;
    this.nextNote = this.now + 0.05;
    return STATIONS[this.station].name;
  }

  update() {
    if (!this.ctx || this.station === 0) return;
    const st = STATIONS[this.station];
    const sixteenth = 60 / st.bpm / 4;
    if (this.nextNote < this.now) this.nextNote = this.now + 0.02;
    while (this.nextNote < this.now + 0.15) {
      this.playStep(st, this.step, this.nextNote, sixteenth);
      this.nextNote += sixteenth;
      this.step++;
    }
  }

  playStep(st, i, t, len) {
    const m = this.music;
    const s = i % 16;
    const chord = st.prog[Math.floor(i / 16) % st.prog.length];
    const root = st.root * semi(chord);
    if (s % 4 === 0) this.tone(150, t, 0.18, 'sine', 0.9, m, 40);
    if (s === 4 || s === 12) this.hiss(t, 0.16, 0.35, 'highpass', 1500, m);
    if (s % 2 === 1) this.hiss(t, 0.04, 0.12, 'highpass', 7000, m);
    const bassOn = st.funk ? [0, 3, 6, 8, 10, 11].includes(s) : s % 2 === 0;
    if (bassOn) this.tone(root * (s % 8 === 6 ? 2 : 1), t, len * 1.6, st.bass, 0.16, m);
    if (s === 0) {
      for (const n of [0, st.third, 7]) this.tone(root * 4 * semi(n), t, len * 15, 'sawtooth', 0.025, m);
    }
    if (s % 2 === 0 && Math.random() < st.leadP) {
      this.tone(root * 4 * semi(SCALE[Math.floor(Math.random() * SCALE.length)]), t, len * 2, st.lead, 0.05, m);
    }
  }
}
