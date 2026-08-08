// WebAudio synthesized engine/screech/nitrous. No external files.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.started = false;
  }
  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // Engine: two detuned oscillators through a lowpass
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0.0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 800;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth'; this.osc1.frequency.value = 60;
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square'; this.osc2.frequency.value = 62;
    this.osc1.connect(this.engFilter); this.osc2.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    this.osc1.start(); this.osc2.start();

    // Screech: filtered noise
    this.noiseBuf = this._noise();
    this.screechGain = ctx.createGain(); this.screechGain.gain.value = 0;
    this.screechFilter = ctx.createBiquadFilter();
    this.screechFilter.type = 'bandpass'; this.screechFilter.frequency.value = 2200; this.screechFilter.Q.value = 6;
    this.screechSrc = ctx.createBufferSource(); this.screechSrc.buffer = this.noiseBuf; this.screechSrc.loop = true;
    this.screechSrc.connect(this.screechFilter); this.screechFilter.connect(this.screechGain); this.screechGain.connect(this.master);
    this.screechSrc.start();

    // Nitro whoosh: noise through highpass
    this.nitroGain = ctx.createGain(); this.nitroGain.gain.value = 0;
    this.nitroFilter = ctx.createBiquadFilter(); this.nitroFilter.type = 'highpass'; this.nitroFilter.frequency.value = 500;
    this.nitroSrc = ctx.createBufferSource(); this.nitroSrc.buffer = this.noiseBuf; this.nitroSrc.loop = true;
    this.nitroSrc.connect(this.nitroFilter); this.nitroFilter.connect(this.nitroGain); this.nitroGain.connect(this.master);
    this.nitroSrc.start();

    this.started = true;
  }
  _noise() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  // engine: rpm 0..1, throttle 0..1
  updateEngine(rpm, throttle) {
    if (!this.started || this.muted) return;
    const base = 55 + rpm * 320;
    this.osc1.frequency.setTargetAtTime(base, this.ctx.currentTime, 0.05);
    this.osc2.frequency.setTargetAtTime(base * 1.02, this.ctx.currentTime, 0.05);
    this.engFilter.frequency.setTargetAtTime(500 + rpm * 2500, this.ctx.currentTime, 0.05);
    this.engGain.gain.setTargetAtTime(0.06 + throttle * 0.10 + rpm * 0.05, this.ctx.currentTime, 0.1);
  }
  setScreech(amount) {
    if (!this.started) return;
    this.screechGain.gain.setTargetAtTime(this.muted ? 0 : amount * 0.14, this.ctx.currentTime, 0.05);
  }
  setNitro(on) {
    if (!this.started) return;
    this.nitroGain.gain.setTargetAtTime(this.muted || !on ? 0 : 0.1, this.ctx.currentTime, 0.05);
  }
  beep(freq = 440, dur = 0.12, type = 'square', vol = 0.2) {
    if (!this.started || this.muted) return;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.master); o.start(); o.stop(this.ctx.currentTime + dur);
  }
  // crunch: burst of filtered noise for tree smash
  crunch() {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    src.connect(filt).connect(g).connect(this.master);
    src.start(); src.stop(ctx.currentTime + 0.35);
    this.beep(140, 0.18, 'sawtooth', 0.18);
  }
  // impact: metallic clang for barrier hit
  impact() {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 1800; filt.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    src.connect(filt).connect(g).connect(this.master);
    src.start(); src.stop(ctx.currentTime + 0.25);
    this.beep(320, 0.12, 'square', 0.16);
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    return this.muted;
  }
}
