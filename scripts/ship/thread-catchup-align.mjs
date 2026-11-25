const RATE = 16000;
const FRAME = 400;
export const HOP = 160;
const FFT = 512;
const BANDS = 24;
const SILENT_BELOW_DB = 32;
const KEEP_ABOVE_DBFS = -45;
const KEEP_BELOW_PEAK_DB = 25;
const NOISE_FLOOR_DBFS = -65;

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

export const features = (samples, topOverride = null, channelOverride = null) => {
  const count = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);
  const shape = [];
  const energy = new Float64Array(count);
  const dbfs = new Float64Array(count);
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
    let sq = 0;
    for (let i = 0; i < FRAME; i++) sq += samples[f * HOP + i] * samples[f * HOP + i];
    dbfs[f] = 10 * Math.log10(sq / FRAME + 1e-12);
  }
  const sorted = Float64Array.from(energy).sort();
  const top = topOverride ?? sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const silent = Uint8Array.from(energy, (e) => (e < top - SILENT_BELOW_DB ? 1 : 0));
  const channel = channelOverride ? Float64Array.from(channelOverride) : new Float64Array(BANDS);
  let voicedFrames = 0;
  if (!channelOverride) {
    for (let f = 0; f < count; f++) if (!silent[f]) { voicedFrames++; for (let b = 0; b < BANDS; b++) channel[b] += shape[f][b]; }
    if (voicedFrames) for (let b = 0; b < BANDS; b++) channel[b] /= voicedFrames;
  }
  for (let f = 0; f < count; f++) for (let b = 0; b < BANDS; b++) shape[f][b] -= channel[b];
  const peakDbfs = dbfs.reduce((m, v) => Math.max(m, v), -Infinity);
  const countable = Uint8Array.from(dbfs, (d, i) => (!silent[i] && (d >= KEEP_ABOVE_DBFS || (d >= NOISE_FLOOR_DBFS && d >= peakDbfs - KEEP_BELOW_PEAK_DB)) ? 1 : 0));
  return { shape, energy, silent, countable, count, top, channel };
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
const NOISE_RUN_MS = 20;
const PATH_EDGE_MS = 300;
const UNION_EDGE_MS = 100;

export const align = (heardSamples, sourceSamples) => {
  const source = features(sourceSamples);
  const heard = features(heardSamples, source.top, source.channel);
  const H = heard.count;
  const S = source.count;
  if (H < 2 || S < 2) return { startMs: 0, endMs: 0, meanVoicedCost: INF, matchedVoiced: 0, heardVoiced: 0, sourceVoiced: 0, sourceVoicedCovered: 0, windows: [], gapWindows: [], missingRuns: [], missingVoicedMs: 0, longestMissingRunMs: 0, costAt: new Float32Array(S), matchedAt: new Uint8Array(S), startJ: 0, endJ: 0, sourceSilent: source.silent, heardEnergy: heard.energy, sourceEnergy: source.energy, path: [] };
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
  const matchedAt = new Uint8Array(S);
  const costAt = new Float32Array(S).fill(99);
  for (const [i, j] of path) if (!heard.silent[i] && !source.silent[j]) costAt[j] = Math.min(costAt[j], frameCost(heard, i, source, j));
  for (let j = 0; j < S; j++) {
    if (costAt[j] >= 99) continue;
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, j - 1); k <= Math.min(S - 1, j + 1); k++) if (costAt[k] < 99) { sum += costAt[k]; n++; }
    if (sum / n <= WINDOW_COST_LIMIT) matchedAt[j] = 1;
  }
  const missing = new Uint8Array(S);
  const edge = Math.round(PATH_EDGE_MS / HOP_MS);
  for (let j = startJ + edge; j <= endJ - edge; j++) if (source.countable[j] && !matchedAt[j] && !matchedAt[j - 1] && !matchedAt[j + 1]) missing[j] = 1;
  let missingFrames = 0;
  let longestRun = 0;
  let run = 0;
  const missingRuns = [];
  for (let j = startJ; j <= endJ + 1; j++) {
    if (missing[j]) { run++; longestRun = Math.max(longestRun, run); }
    else {
      if (run * HOP_MS > NOISE_RUN_MS) { missingFrames += run; missingRuns.push([Math.round((j - run) * HOP_MS), Math.round(j * HOP_MS)]); }
      run = 0;
    }
  }
  return {
    missingRuns,
    costAt,
    matchedAt,
    startJ,
    endJ,
    sourceSilent: source.silent,
    missingVoicedMs: Math.round(missingFrames * HOP_MS),
    longestMissingRunMs: Math.round(longestRun * HOP_MS),
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


const EDGE_BLOCK = 1600;
const EDGE_SEARCH = 2400;
const EDGE_MIN_CORRELATION = 0.5;

const bestLag = (heard, from, source, centre) => {
  let hEnergy = 0;
  for (let i = 0; i < EDGE_BLOCK; i++) hEnergy += heard[from + i] * heard[from + i];
  if (hEnergy / EDGE_BLOCK < 1e-6) return null;
  let best = null;
  for (let s = Math.max(0, centre - EDGE_SEARCH); s <= centre + EDGE_SEARCH && s + EDGE_BLOCK <= source.length; s++) {
    let dot = 0;
    let sEnergy = 0;
    for (let i = 0; i < EDGE_BLOCK; i += 2) { const v = source[s + i]; dot += v * heard[from + i]; sEnergy += v * v; }
    const correlation = dot / Math.sqrt((sEnergy * hEnergy) / 2 + 1e-12);
    if (!best || correlation > best.correlation) best = { lag: s, correlation };
  }
  return best && best.correlation >= EDGE_MIN_CORRELATION ? best : null;
};

export const unionCoverage = (segmentSamples, sourceSamples) => {
  const source = features(sourceSamples);
  const S = source.count;
  const matched = new Uint8Array(S + 2);
  let first = Infinity;
  let last = -Infinity;
  for (const seg of segmentSamples) {
    if (seg.length < EDGE_BLOCK * 2) continue;
    const one = align(seg, sourceSamples);
    for (let j = 0; j < S; j++) if (one.matchedAt[j]) matched[j] = 1;
    let startFrame = one.startJ;
    let endFrame = one.endJ;
    const head = bestLag(seg, 0, sourceSamples, one.startJ * HOP);
    if (head) startFrame = Math.min(startFrame, Math.floor(head.lag / HOP));
    const tail = bestLag(seg, seg.length - EDGE_BLOCK, sourceSamples, one.endJ * HOP - EDGE_BLOCK);
    if (tail) endFrame = Math.max(endFrame, Math.ceil((tail.lag + EDGE_BLOCK) / HOP));
    for (let j = startFrame; j <= one.startJ; j++) matched[j] = 1;
    for (let j = one.endJ; j <= endFrame && j < S; j++) matched[j] = 1;
    first = Math.min(first, startFrame);
    last = Math.max(last, endFrame);
  }
  const missingRuns = [];
  let missingFrames = 0;
  let run = 0;
  const trim = Math.round(UNION_EDGE_MS / HOP_MS);
  const lastCounted = last - trim;
  for (let j = first + trim; j <= lastCounted + 1; j++) {
    const miss = j <= lastCounted && source.countable[j] && !matched[j];
    if (miss) run++;
    else { if (run * HOP_MS > NOISE_RUN_MS) { missingFrames += run + 1; missingRuns.push([Math.round((j - run) * HOP_MS), Math.round(j * HOP_MS)]); } run = 0; }
  }
  return { missingVoicedMs: Math.round(missingFrames * HOP_MS), missingRuns, startMs: first * HOP_MS, endMs: last * HOP_MS };
};
