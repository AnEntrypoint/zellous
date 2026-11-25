const RATE = 16000;
const FRAME = 400;
const HOP = 320;
const FFT = 512;
const BANDS = 24;
const SILENT_BELOW_DB = 32;

export const HOP_MS = (HOP / RATE) * 1000;

const fft = (re, im) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
};

const bandEdges = (() => {
  const lo = 100;
  const hi = 7500;
  const edges = [];
  for (let b = 0; b <= BANDS; b++) edges.push(Math.round(((lo * Math.pow(hi / lo, b / BANDS)) / (RATE / 2)) * (FFT / 2)));
  return edges;
})();

const hann = Float64Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));

export const features = (samples) => {
  const count = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);
  const shape = [];
  const energy = new Float64Array(count);
  const re = new Float64Array(FFT);
  const im = new Float64Array(FFT);
  for (let f = 0; f < count; f++) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < FRAME; i++) re[i] = samples[f * HOP + i] * hann[i];
    fft(re, im);
    const logs = new Float64Array(BANDS);
    let mean = 0;
    let total = 0;
    for (let b = 0; b < BANDS; b++) {
      let p = 0;
      const from = bandEdges[b];
      const to = Math.max(bandEdges[b + 1], from + 1);
      for (let k = from; k < to; k++) p += re[k] * re[k] + im[k] * im[k];
      total += p;
      logs[b] = 10 * Math.log10(p / (to - from) + 1e-9);
      mean += logs[b];
    }
    mean /= BANDS;
    for (let b = 0; b < BANDS; b++) logs[b] -= mean;
    shape.push(logs);
    energy[f] = 10 * Math.log10(total + 1e-9);
  }
  const sorted = Float64Array.from(energy).sort();
  const top = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const silent = Uint8Array.from(energy, (e) => (e < top - SILENT_BELOW_DB ? 1 : 0));
  const channel = new Float64Array(BANDS);
  let voicedFrames = 0;
  for (let f = 0; f < count; f++) if (!silent[f]) { voicedFrames++; for (let b = 0; b < BANDS; b++) channel[b] += shape[f][b]; }
  if (voicedFrames) for (let b = 0; b < BANDS; b++) channel[b] /= voicedFrames;
  for (let f = 0; f < count; f++) for (let b = 0; b < BANDS; b++) shape[f][b] -= channel[b];
  return { shape, energy, silent, count };
};

const frameCost = (a, i, b, j) => {
  let d = 0;
  const x = a.shape[i];
  const y = b.shape[j];
  for (let k = 0; k < BANDS; k++) { const t = x[k] - y[k]; d += t * t; }
  d = Math.sqrt(d / BANDS);
  const bothVoiced = !a.silent[i] && !b.silent[j];
  return bothVoiced ? d : 4 + 0.1 * Math.abs(a.energy[i] - b.energy[j]);
};

const MIN_VOICED_WINDOW = 10;
const WINDOW_COST_LIMIT = 6;
const STEP_PENALTY = 1.5;
const INF = 1e18;

export const align = (heardSamples, sourceSamples) => {
  const heard = features(heardSamples);
  const source = features(sourceSamples);
  const H = heard.count;
  const S = source.count;
  const D = new Float64Array(H * S).fill(INF);
  const back = new Int32Array(H * S).fill(-1);
  const at = (i, j) => i * S + j;
  for (let j = 0; j < S; j++) D[at(0, j)] = frameCost(heard, 0, source, j);
  for (let i = 1; i < H; i++) {
    let running = INF;
    let runningFrom = -1;
    for (let j = 1; j < S; j++) {
      const carried = source.silent[j - 1] ? running : INF;
      const carriedFrom = source.silent[j - 1] ? runningFrom : -1;
      running = D[at(i - 1, j - 1)];
      runningFrom = j - 1;
      if (carried < running) { running = carried; runningFrom = carriedFrom; }
      let best = running;
      let from = runningFrom >= 0 ? at(i - 1, runningFrom) : -1;
      const stay = D[at(i - 1, j)] + STEP_PENALTY;
      if (stay < best) { best = stay; from = at(i - 1, j); }
      if (j >= 2) { const fast = D[at(i - 1, j - 2)] + STEP_PENALTY; if (fast < best) { best = fast; from = at(i - 1, j - 2); } }
      if (i >= 2) { const slow = D[at(i - 2, j - 1)] + STEP_PENALTY; if (slow < best) { best = slow; from = at(i - 2, j - 1); } }
      if (from >= 0) { D[at(i, j)] = best + frameCost(heard, i, source, j); back[at(i, j)] = from; }
    }
  }
  let endJ = 0;
  for (let j = 0; j < S; j++) if (D[at(H - 1, j)] < D[at(H - 1, endJ)]) endJ = j;
  const path = [];
  let cell = at(H - 1, endJ);
  while (cell >= 0) {
    path.push([Math.floor(cell / S), cell % S]);
    cell = back[cell];
  }
  path.reverse();
  const startJ = path[0][1];
  let voicedCost = 0;
  let voicedCount = 0;
  for (const [i, j] of path) if (!heard.silent[i] && !source.silent[j]) { voicedCost += frameCost(heard, i, source, j); voicedCount++; }
  let sourceVoiced = 0;
  let sourceVoicedCovered = 0;
  for (let j = 0; j < S; j++) {
    if (source.silent[j]) continue;
    sourceVoiced++;
    if (j >= startJ && j <= endJ) sourceVoicedCovered++;
  }
  const perWindow = Math.round(1000 / HOP_MS);
  const windows = [];
  for (let w = 0; w * perWindow < S; w++) {
    let voiced = 0;
    for (let j = w * perWindow; j < Math.min(S, (w + 1) * perWindow); j++) if (!source.silent[j]) voiced++;
    let cost = 0;
    let n = 0;
    for (const [i, j] of path) if (j >= w * perWindow && j < (w + 1) * perWindow && !heard.silent[i] && !source.silent[j]) { cost += frameCost(heard, i, source, j); n++; }
    windows.push({ second: w, voiced, matched: n, cost: n ? cost / n : null });
  }
  const gapWindows = windows.filter((w) => w.voiced >= MIN_VOICED_WINDOW && w.second * perWindow >= startJ && (w.second + 1) * perWindow <= endJ && (w.cost === null || w.cost > WINDOW_COST_LIMIT)).map((w) => w.second);
  const heardVoiced = heard.silent.reduce((n, s) => n + (s ? 0 : 1), 0);
  return {
    startMs: startJ * HOP_MS,
    endMs: endJ * HOP_MS,
    meanVoicedCost: voicedCount ? voicedCost / voicedCount : INF,
    matchedVoiced: voicedCount,
    heardVoiced,
    sourceVoiced,
    sourceVoicedCovered,
    windows,
    gapWindows,
    heardEnergy: heard.energy,
    sourceEnergy: source.energy,
    path
  };
};

export const toRate16k = (samples, fromRate) => {
  const ratio = fromRate / RATE;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const from = i * ratio;
    const to = (i + 1) * ratio;
    let sum = 0;
    let weight = 0;
    for (let k = Math.floor(from); k < Math.min(samples.length, Math.ceil(to)); k++) {
      const w = Math.min(k + 1, to) - Math.max(k, from);
      sum += samples[k] * w;
      weight += w;
    }
    out[i] = weight ? sum / weight : 0;
  }
  return out;
};

export const SAMPLE_RATE = RATE;
