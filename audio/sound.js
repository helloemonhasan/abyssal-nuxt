/* Sound: generated live with Web Audio, no audio files */
export class Sound {
  constructor() { this.on = false; this.ready = false; }
  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain(); this.master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      this.master.connect(comp); comp.connect(ctx.destination);

      this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(3.4, 2.6);
      const vg = ctx.createGain(); vg.gain.value = 0.55; this.verb.connect(vg); vg.connect(this.master);

      this.echo = ctx.createDelay(1.0); this.echo.delayTime.value = 0.36;
      const fb = ctx.createGain(); fb.gain.value = 0.42; this.echo.connect(fb); fb.connect(this.echo);
      const eo = ctx.createGain(); eo.gain.value = 0.5; this.echo.connect(eo); eo.connect(this.master); eo.connect(this.verb);

      // Ocean rumble: brown noise through a slowly breathing low-pass
      const noise = ctx.createBufferSource(); noise.buffer = this.brown(5); noise.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 360;
      const ng = ctx.createGain(); ng.gain.value = 0.3;
      noise.connect(lp); lp.connect(ng); ng.connect(this.master); noise.start();
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lfoG = ctx.createGain(); lfoG.gain.value = 170; lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();

      // One pad per scene; the scroll position crossfades them
      const chords = [
        [130.81, 196.0, 261.63, 329.63, 392.0],
        [110.0, 164.81, 220.0, 277.18, 329.63],
        [98.0, 146.83, 196.0, 233.08, 293.66],
        [87.31, 130.81, 174.61, 207.65, 261.63],
        [73.42, 110.0, 146.83, 155.56, 220.0],
        [146.83, 220.0, 293.66, 369.99, 440.0],
      ];
      this.pads = chords.map((ch, i) => {
        const g = ctx.createGain(); g.gain.value = 0;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = (i === 0 || i === 5) ? 1900 : 850; f.Q.value = 0.4;
        f.connect(g); g.connect(this.master); g.connect(this.verb);
        ch.forEach((hz, k) => {
          [-5, 5].forEach(det => {
            const o = ctx.createOscillator();
            o.type = k % 2 ? 'triangle' : 'sine';
            o.frequency.value = hz; o.detune.value = det + (Math.random() * 4 - 2);
            const og = ctx.createGain(); og.gain.value = 0.04 / (1 + k * 0.35);
            o.connect(og); og.connect(f); o.start();
          });
        });
        const l = ctx.createOscillator(); l.frequency.value = 0.05 + i * 0.013;
        const lg = ctx.createGain(); lg.gain.value = (i === 0 || i === 5) ? 600 : 280;
        l.connect(lg); lg.connect(f.frequency); l.start();
        return g;
      });
      this.ready = true;
    } catch (e) { console.warn('Audio unavailable', e); }
  }
  brown(sec) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    return buf;
  }
  impulse(sec, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return buf;
  }
  setOn(v) {
    this.on = v;
    if (!this.ready) return;
    if (v && this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(v ? 0.85 : 0, this.ctx.currentTime, 0.5);
  }
  mix(weights) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.pads.forEach((g, i) => g.gain.setTargetAtTime(weights[i] || 0, now, 0.7));
  }
  tone({ freq = 880, to = null, dur = 0.15, type = 'sine', vol = 0.1, verb = 0.3, attack = 0.005, echo = false }) {
    if (!this.ready || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    if (verb) { const s = ctx.createGain(); s.gain.value = verb; g.connect(s); s.connect(this.verb); }
    if (echo) g.connect(this.echo);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noiseBurst(dur = 0.6, from = 1400, to = 300, vol = 0.18) {
    if (!this.ready || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime, len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(from, t); bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    const s = ctx.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(this.verb);
    src.start(t);
  }
  splash() { this.noiseBurst(0.7, 1800, 250, 0.22); this.bubbles(); }
  whale() {
    if (!this.ready || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [[190, 105, 0.11], [380, 210, 0.03]].forEach(([a, b, v]) => {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(a, t); o.frequency.exponentialRampToValueAtTime(b, t + 3.2);
      const vib = ctx.createOscillator(); vib.frequency.value = 4.5;
      const vg = ctx.createGain(); vg.gain.value = a * 0.03; vib.connect(vg); vg.connect(o.frequency); vib.start(t); vib.stop(t + 3.6);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
      o.connect(g); g.connect(this.master); const s = ctx.createGain(); s.gain.value = 1.2; g.connect(s); s.connect(this.verb); g.connect(this.echo);
      o.start(t); o.stop(t + 3.6);
    });
  }
  shark() { this.tone({ freq: 55, to: 48, dur: 1.6, type: 'sine', vol: 0.2, verb: 0.6 }); this.tone({ freq: 58.3, dur: 1.4, type: 'sine', vol: 0.12, verb: 0.6 }); }
  dispose() { try { if (this.ctx) this.ctx.close(); } catch (e) { /* ignore */ } this.ready = false; this.on = false; }
  hover() { this.tone({ freq: 2300, to: 1700, dur: 0.07, vol: 0.03, verb: 0.15 }); }
  click() { this.tone({ freq: 520, to: 240, dur: 0.2, type: 'triangle', vol: 0.08, verb: 0.2 }); }
  ping() { this.tone({ freq: 1480, dur: 1.8, vol: 0.14, verb: 0.9, attack: 0.002, echo: true }); this.tone({ freq: 2220, dur: 0.8, vol: 0.03, verb: 0.9 }); }
  step(i) { this.tone({ freq: [392, 493.88, 587.33, 783.99][i] || 440, dur: 0.6, type: 'triangle', vol: 0.05, verb: 0.6 }); }
  chime() { this.tone({ freq: 1046.5, dur: 1.2, vol: 0.035, verb: 0.8 }); this.tone({ freq: 1567.98, dur: 1.4, vol: 0.02, verb: 0.8 }); }
  bubbles() { for (let i = 0; i < 5; i++) setTimeout(() => { const f = 280 + Math.random() * 520; this.tone({ freq: f, to: f * 2.6, dur: 0.12, vol: 0.05, verb: 0.3 }); }, i * 45 + Math.random() * 40); }
}
export const sound = new Sound();
