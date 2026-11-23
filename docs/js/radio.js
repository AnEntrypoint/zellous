const CHORDS = [[174.61, 220, 261.63, 329.63], [164.81, 196, 246.94, 293.66], [146.83, 174.61, 220, 261.63], [130.81, 164.81, 196, 246.94]];
const BEAT = 60 / 76;
const BAR = BEAT * 4;
const AHEAD = 1.2;
const MASTER = 0.35;

export function createRadio() {
  let ctx = null;
  let master = null;
  let timer = null;
  let nextBar = 0;
  let bar = 0;
  let noiseBuf = null;

  const noise = () => {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  };

  const pad = (freq, t) => {
    const osc = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() - 0.5) * 14;
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + BAR + 0.4);
    osc.connect(lp).connect(g).connect(master);
    osc.start(t);
    osc.stop(t + BAR + 0.5);
  };

  const kick = (t) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.25);
  };

  const hit = (t, level, hp, dur) => {
    const src = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = noise();
    f.type = 'highpass';
    f.frequency.value = hp;
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  };

  const scheduleBar = (t) => {
    CHORDS[bar % CHORDS.length].forEach((f) => pad(f, t));
    for (let b = 0; b < 4; b++) {
      const bt = t + b * BEAT;
      if (b % 2 === 0) kick(bt);
      else hit(bt, 0.1, 1800, 0.12);
      hit(bt + BEAT / 2 + 0.03, 0.025, 7000, 0.04);
    }
    bar++;
  };

  const pump = () => {
    while (nextBar < ctx.currentTime + AHEAD) { scheduleBar(nextBar); nextBar += BAR; }
  };

  return {
    get playing() { return !!timer; },
    start() {
      if (timer || typeof AudioContext === 'undefined') return;
      ctx = ctx || new AudioContext();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.gain.linearRampToValueAtTime(MASTER, ctx.currentTime + 1.5);
      master.connect(ctx.destination);
      const crackle = ctx.createBufferSource();
      const cg = ctx.createGain();
      crackle.buffer = noise();
      crackle.loop = true;
      cg.gain.value = 0.004;
      crackle.connect(cg).connect(master);
      crackle.start();
      master.crackle = crackle;
      nextBar = ctx.currentTime + 0.1;
      bar = 0;
      pump();
      timer = setInterval(pump, 300);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      const m = master;
      m.gain.cancelScheduledValues(ctx.currentTime);
      m.gain.setValueAtTime(m.gain.value, ctx.currentTime);
      m.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 1);
      setTimeout(() => { try { m.crackle.stop(); m.disconnect(); } catch {} }, 1200);
    }
  };
}
