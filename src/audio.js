// WebAudio: 3D-positioned sound effects, layered engine, warnings, and a procedural radio.

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
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.comp);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // brown noise for rumbles
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const bd = this.brown.getChannelData(0);
    for (let i = 0; i < len; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = b * 3.5; }

    // engine: saw + filtered brown-noise rumble
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engGain.connect(this.master);
    this.engOsc = ctx.createOscillator();
    this.engOsc.type = 'sawtooth';
    this.engOsc.frequency.value = 40;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 300;
    this.engOsc.connect(this.engFilter).connect(this.engGain);
    this.engOsc.start();
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.brown;
    rumble.loop = true;
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = 200;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    rumble.connect(this.rumbleFilter).connect(this.rumbleGain).connect(this.master);
    rumble.start();

    this.sirOsc = ctx.createOscillator();
    this.sirOsc.type = 'triangle';
    this.sirGain = ctx.createGain();
    this.sirGain.gain.value = 0;
    this.sirOsc.connect(this.sirGain).connect(this.master);
    this.sirOsc.start();

    this.music = ctx.createGain();
    this.music.gain.value = 0.28;
    this.music.connect(this.master);
    this.station = 0;
    this.step = 0;
    this.nextNote = 0;
    this.beepT = 0;
  }

  get now() { return this.ctx.currentTime; }

  setListener(pos, fwd, up) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      const t = this.now;
      l.positionX.setTargetAtTime(pos.x, t, 0.02); l.positionY.setTargetAtTime(pos.y, t, 0.02); l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02); l.forwardY.setTargetAtTime(fwd.y, t, 0.02); l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.setTargetAtTime(up.x, t, 0.02); l.upY.setTargetAtTime(up.y, t, 0.02); l.upZ.setTargetAtTime(up.z, t, 0.02);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  // Returns a destination node placed in 3D (or the master bus for UI sounds).
  at(pos, ref = 30, life = 3) {
    if (!pos) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = 5000;
    p.rolloffFactor = 1.2;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.master);
    setTimeout(() => p.disconnect(), life * 1000);
    return p;
  }

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

  hiss(t, dur, gain, filterType, freq, dest = this.master, endFreq, buf = this.noise) {
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = buf;
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  zap(pitch = 1, pos = null, vol = 1) {
    if (!this.ctx) return;
    const d = this.at(pos, 25, 1), t = this.now;
    this.tone(1500 * pitch, t, 0.16, 'square', 0.06 * vol, d, 160 * pitch);
    this.tone(700 * pitch, t, 0.1, 'sawtooth', 0.05 * vol, d, 90 * pitch);
    this.hiss(t, 0.05, 0.12 * vol, 'highpass', 3000, d);
  }

  boom(size = 1, pos = null) {
    if (!this.ctx) return;
    const d = this.at(pos, 60 * size, 4), t = this.now;
    this.hiss(t, 0.25, 1.0 * size, 'lowpass', 4000, d, 300);
    this.hiss(t, 2.2, 1.2 * size, 'lowpass', 500, d, 60, this.brown);
    this.tone(70, t, 1.2, 'sine', 0.9 * size, d, 25);
    this.hiss(t + 0.08, 1.4, 0.25 * size, 'bandpass', 1800, d, 400);
  }

  hit(pos = null) {
    if (!this.ctx) return;
    const d = this.at(pos, 20, 1), t = this.now;
    this.hiss(t, 0.18, 0.5, 'bandpass', 1400, d, 500);
    this.tone(220, t, 0.12, 'square', 0.08, d, 80);
  }

  clang() {
    if (!this.ctx) return;
    const t = this.now;
    this.hiss(t, 0.4, 0.8, 'lowpass', 1200, this.master, 120, this.brown);
    this.tone(160, t, 0.3, 'triangle', 0.25, this.master, 60);
  }

  missile(pos = null) {
    if (!this.ctx) return;
    const d = this.at(pos, 40, 3), t = this.now;
    this.hiss(t, 1.6, 0.6, 'bandpass', 600, d, 2500);
    this.tone(90, t, 0.5, 'sawtooth', 0.15, d, 50);
  }

  flare() {
    if (!this.ctx) return;
    const t = this.now;
    for (let i = 0; i < 4; i++) this.hiss(t + i * 0.07, 0.12, 0.3, 'highpass', 2500, this.master);
  }

  // lock: 0 none, 1 acquiring, 2 locked
  lockTone(state, dt) {
    if (!this.ctx || !state) return;
    this.beepT -= dt;
    if (this.beepT > 0) return;
    const t = this.now;
    if (state === 2) { this.tone(1760, t, 0.09, 'sine', 0.06); this.beepT = 0.1; }
    else { this.tone(1100, t, 0.06, 'sine', 0.05); this.beepT = 0.3; }
  }

  warning(dt) {
    if (!this.ctx) return;
    this.warnT = (this.warnT || 0) - dt;
    if (this.warnT > 0) return;
    this.warnT = 0.22;
    this.tone(880, this.now, 0.1, 'square', 0.07);
  }

  weapon(id, pos = null) {
    if (!this.ctx) return;
    const d = this.at(pos, 30, 3), t = this.now;
    switch (id) {
      case 'scatter':
        this.hiss(t, 0.3, 0.7, 'lowpass', 2500, d, 200);
        this.tone(110, t, 0.2, 'sine', 0.5, d, 40);
        break;
      case 'rail':
        this.tone(3200, t, 0.35, 'square', 0.06, d, 120);
        this.hiss(t, 0.12, 0.5, 'highpass', 4000, d);
        this.tone(55, t, 0.5, 'sine', 0.6, d, 30);
        break;
      case 'arc':
        for (let i = 0; i < 5; i++) this.hiss(t + i * 0.025, 0.04, 0.35, 'bandpass', 1500 + Math.random() * 4000, d);
        break;
      case 'mortar':
        this.tone(140, t, 0.3, 'sine', 0.6, d, 50);
        this.hiss(t, 0.2, 0.3, 'bandpass', 800, d, 200);
        break;
      case 'gravity':
        this.tone(420, t, 0.9, 'sawtooth', 0.08, d, 40);
        break;
      case 'wellOpen':
        this.tone(48, t, 3, 'sine', 0.5, d, 28);
        this.hiss(t, 3, 0.5, 'lowpass', 300, d, 60, this.brown);
        break;
      case 'swarm':
        for (let i = 0; i < 6; i++) this.hiss(t + i * 0.05, 0.25, 0.25, 'bandpass', 900, d, 3000);
        break;
      case 'siphon':
        this.tone(500 + Math.random() * 300, t, 0.09, 'sine', 0.035, d);
        break;
    }
  }

  buy() {
    if (!this.ctx) return;
    const t = this.now;
    [1319, 1568, 2093].forEach((f, i) => this.tone(f, t + i * 0.07, 0.25, 'triangle', 0.1));
    this.hiss(t, 0.2, 0.2, 'highpass', 6000);
  }

  footstep() {
    if (!this.ctx) return;
    this.hiss(this.now, 0.07, 0.12, 'bandpass', 900 + Math.random() * 400, this.master);
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

  setEngine(level, boost) {
    if (!this.ctx) return;
    const t = this.now;
    this.engGain.gain.setTargetAtTime(level * 0.07, t, 0.1);
    this.engOsc.frequency.setTargetAtTime(38 + level * 55, t, 0.15);
    this.engFilter.frequency.setTargetAtTime(180 + level * 900, t, 0.15);
    this.rumbleGain.gain.setTargetAtTime(level * (boost ? 0.5 : 0.25), t, 0.15);
    this.rumbleFilter.frequency.setTargetAtTime(boost ? 900 : 260, t, 0.2);
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
