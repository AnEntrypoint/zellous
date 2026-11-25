import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { align, features, toRate16k, unionCoverage, HOP, HOP_MS } from './thread-catchup-align.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const wireweaveDir = process.env.WIREWEAVE_DIR || new URL('../../../wireweave', import.meta.url).pathname;
const { WebSocketServer } = await import(wireweaveDir + '/node_modules/ws/wrapper.mjs');
const { EphemeralRelay } = await import(wireweaveDir + '/src/ephemeral-relay.js');
const { generateSecretKey, getPublicKey } = await import(wireweaveDir + '/node_modules/nostr-tools/lib/esm/pure.js');

const SPEECH_DIR = process.env.SPEECH_DIR;
if (!SPEECH_DIR) { console.log('FAIL setup: SPEECH_DIR must name a directory of 48 kHz mono 16-bit wav speech clips'); process.exit(1); }
const WORK = fs.mkdtempSync(path.join(process.env.OUT_DIR || os.tmpdir(), 'thread-catchup-'));
const PORT = Number(process.env.PORT || 5230);
const RELAY_PORT = Number(process.env.RELAY_PORT || 7530);
const RATE = 48000;
const LEAD_S = 7;
const REPEAT_WINDOW_MS = 1600;
const MISSING_VOICED_LIMIT_MS = 40;
const launchOptions = (mic) => ({
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', ...(mic ? ['--use-file-for-fake-audio-capture=' + mic + '%noloop'] : [])],
  ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {})
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const readWav = (file) => {
  const b = fs.readFileSync(file);
  const out = new Float32Array((b.length - 44) / 2);
  for (let i = 0; i < out.length; i++) out[i] = b.readInt16LE(44 + i * 2) / 32768;
  return out;
};

const wavBytes = (samples) => {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return b;
};

const speechFiles = fs.readdirSync(SPEECH_DIR).filter((f) => f.endsWith('.wav')).sort();
const speech = (seconds, offset, gapMs = 700) => {
  const out = new Float32Array(Math.round(seconds * RATE));
  let at = 0;
  for (let k = 0; at < out.length; k++) {
    const clip = readWav(path.join(SPEECH_DIR, speechFiles[(offset + k) % speechFiles.length]));
    const take = Math.min(clip.length, out.length - at);
    out.set(clip.subarray(0, take), at);
    at += take + Math.round((gapMs / 1000) * RATE);
  }
  return out;
};
const silence = (seconds) => new Float32Array(Math.round(seconds * RATE));
const join = (...parts) => { const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
const writeMic = (name, samples) => { const file = path.join(WORK, name + '.wav'); fs.writeFileSync(file, wavBytes(samples)); return file; };

const captureInit = () => {
  const cap = { ctx: null, elements: [], blocks: [] };
  window.__cap = cap;
  const ensureCtx = () => cap.ctx || (cap.ctx = new AudioContext({ sampleRate: 48000 }));
  const hook = (el) => {
    if (el.__capId !== undefined) return;
    el.__capId = cap.elements.length;
    const live = !!el.srcObject;
    cap.elements.push({ live, el });
    const ctx = ensureCtx();
    let source;
    try { source = live ? ctx.createMediaStreamSource(el.srcObject) : ctx.createMediaElementSource(el); } catch { return; }
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    const id = el.__capId;
    proc.onaudioprocess = (e) => {
      if (!live && (el.muted || el.paused)) return;
      const input = e.inputBuffer.getChannelData(0);
      const down = new Float32Array(Math.floor(input.length / 3));
      for (let i = 0; i < down.length; i++) down[i] = (input[3 * i] + input[3 * i + 1] + input[3 * i + 2]) / 3;
      cap.blocks.push({ id, at: performance.now(), muted: el.muted, paused: el.paused, rate: el.playbackRate, data: down });
    };
    source.connect(proc);
    proc.connect(ctx.destination);
    if (!live) source.connect(ctx.destination);
  };
  window.__tapLog = [];
  let tapNodes = 0;
  const NativeNode = window.AudioWorkletNode;
  window.AudioWorkletNode = class extends NativeNode {
    constructor(ctx, name, options) {
      super(ctx, name, options);
      const port = this.port;
      const nodeId = tapNodes++;
      const descriptor = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage');
      Object.defineProperty(port, 'onmessage', { configurable: true, get: () => descriptor.get.call(port), set: (fn) => descriptor.set.call(port, fn && ((e) => { let sum = 0; const d = e.data; for (let i = 0; i < d.length; i++) sum += d[i] * d[i]; window.__tapLog.push([nodeId, performance.now(), d.length, sum]); return fn(e); })) });
    }
  };
  const lockedRate = window.__lockedRate;
  if (lockedRate) {
    const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
    Object.defineProperty(HTMLMediaElement.prototype, 'playbackRate', { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v > 1 ? lockedRate : v); } });
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { try { hook(this); } catch {} return play.apply(this, arguments); };
  window.__capHook = hook;
  const encode = (f) => { let s = ''; const u = new Uint8Array(f.buffer, f.byteOffset, f.byteLength); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  window.__capMeta = () => JSON.stringify({ elements: cap.elements.map((e) => ({ live: e.live, peer: e.el.__peerKey || null })), total: cap.blocks.length });
  window.__capSlice = (from, count) => JSON.stringify(cap.blocks.slice(from, from + count).map((b) => ({ id: b.id, at: b.at, muted: b.muted, paused: b.paused, rate: b.rate, data: encode(b.data) })));
};

const rawAudioInit = () => {
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = (constraints) => {
    if (constraints && constraints.audio) constraints = { ...constraints, audio: { ...(typeof constraints.audio === 'object' ? constraints.audio : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false } };
    return gum(constraints);
  };
};

const wsInit = (port) => {
  const W = window.WebSocket;
  window.WebSocket = function (u, p) { return new W('ws://127.0.0.1:' + port, p); };
  window.WebSocket.prototype = W.prototype;
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
};

const pollerInit = (every) => {
  const timeline = [];
  window.__timeline = timeline;
  setInterval(() => {
    const own = document.querySelector('.ds-g3-vtstate');
    const lanes = [...document.querySelectorAll('.ds-g3-vtlane')].map((l) => ({ name: l.querySelector('.ds-g3-vtname')?.textContent, lag: l.querySelector('.ds-g3-vtlag')?.textContent || '', drop: l.querySelector('.ds-g3-vtdrop')?.textContent || '' }));
    let gate = null;
    try { gate = window.lk.session().livePlaybackOpen; for (const [key, p] of [...window.lk.session().peers, ...window.lk.session().relayed]) if (p.audioEl) { p.audioEl.__peerKey = key; if (window.__capHook) window.__capHook(p.audioEl); } } catch {}
    timeline.push({ at: performance.now(), status: own ? own.textContent : '', ownTalk: !!own && own.classList.contains('own'), gate, lanes });
  }, every);
};

const uplinkInit = (kbps) => {
  const original = RTCPeerConnection.prototype.getStats;
  RTCPeerConnection.prototype.getStats = async function () {
    const report = await original.apply(this, arguments);
    const copy = new Map();
    report.forEach((value, key) => copy.set(key, value && value.type === 'candidate-pair' ? { ...value, availableOutgoingBitrate: kbps * 1000 } : value));
    return copy;
  };
};

const eventLogInit = () => {
  const events = [];
  window.__voiceEvents = events;
  const names = ['mic', 'transmit', 'segment-start', 'segment-finalized', 'segment-dropped', 'segment-received', 'speaker', 'live-playback', 'hub-changed', 'remote-stream'];
  const timer = setInterval(() => {
    let session = null;
    try { session = window.lk.session(); } catch {}
    if (!session || session.__logged) return;
    session.__logged = true;
    clearInterval(timer);
    const profile = async (segment, type) => {
      try {
        const ctx = new OfflineAudioContext(1, 48000, 48000);
        const buf = await ctx.decodeAudioData(segment.bytes.buffer.slice(segment.bytes.byteOffset, segment.bytes.byteOffset + segment.bytes.byteLength));
        const data = buf.getChannelData(0);
        const step = Math.round(buf.sampleRate * 0.1);
        const levels = [];
        for (let i = 0; i < data.length; i += step) { let sum = 0; const end = Math.min(data.length, i + step); for (let k = i; k < end; k++) sum += data[k] * data[k]; levels.push(Math.round(10 * Math.log10(sum / (end - i) + 1e-12))); }
        events.push({ at: Math.round(performance.timeOrigin + performance.now()), type: 'clip-levels-' + type, detail: JSON.stringify({ seq: segment.seq, durationMs: Math.round(buf.duration * 1000), levelsDb100ms: levels }) });
      } catch (err) { events.push({ at: Math.round(performance.timeOrigin + performance.now()), type: 'clip-levels-error', detail: err.message }); }
    };
    for (const name of names) session.addEventListener(name, (e) => {
      const d = e.detail || {};
      const seg = d.segment;
      if (seg && seg.bytes && (name === 'segment-received' || name === 'segment-finalized' || name === 'segment-dropped')) profile(seg, name);
      events.push({ at: Math.round(performance.timeOrigin + performance.now()), type: name, detail: JSON.stringify({ muted: d.muted, mode: d.mode, key: d.key, speaking: d.speaking, open: d.open, hub: d.hub && d.hub.slice(0, 8), peer: d.peerPubkey && d.peerPubkey.slice(0, 8), from: d.from && d.from.slice(0, 8), kind: d.kind, ts: seg && seg.ts, dur: seg && seg.dur, seq: seg && seg.seq, verdict: d.verdict && { keep: d.verdict.keep, reason: d.verdict.reason, voicedMs: Math.round(d.verdict.voicedMs), spanMs: Math.round(d.verdict.spanMs), frames: d.verdict.frames } }) });
    });
  }, 50);
};

let relay = null;
let dev = null;
const failures = [];
const report = (ok, label) => { console.log((ok ? 'ok    ' : 'FAIL  ') + label); if (!ok) failures.push(label); };

const startRig = async () => {
  relay = new EphemeralRelay({ WebSocketServer, port: RELAY_PORT });
  dev = spawn('node', ['scripts/dev-server.mjs'], { cwd: new URL('../..', import.meta.url).pathname, env: { ...process.env, ZELLOUS_LOCAL_DEPS: '1', PORT: String(PORT) }, stdio: 'ignore' });
  await wait(2500);
};

const stopRig = () => { try { dev?.kill(); } catch {} try { relay?.close?.(); } catch {} };

const boot = async (browser, { capture = false, poll = 0, key = null, role = '', uplink = null } = {}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('      pageerror', e.message, (e.stack || '').split('\n').slice(1, 4).join(' | ')));
  await page.addInitScript(wsInit, RELAY_PORT);
  await page.addInitScript(rawAudioInit);
  await page.addInitScript(eventLogInit);
  if (uplink) await page.addInitScript(uplinkInit, uplink);
  if (key) await page.addInitScript((k) => { try { if (!localStorage.getItem('zn_sk')) localStorage.setItem('zn_sk', k); } catch {} }, key);
  if (process.env.LOCK_RATE) await page.addInitScript((r) => { window.__lockedRate = r; }, Number(process.env.LOCK_RATE));
  if (capture) await page.addInitScript(captureInit);
  if (poll) await page.addInitScript(pollerInit, poll);
  await page.goto('http://127.0.0.1:' + PORT + '/nostr-chat/?local=1&cb=' + Date.now());
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.waitForFunction(() => window.appReady === true, null, { timeout: 40000 });
      await page.getByText('Continue without a backup').click({ timeout: 1500 }).catch(() => {});
      await page.evaluate(() => { window.stateSignals.setupOpen.value = false; });
      return page;
    } catch { await wait(1500); }
  }
  throw new Error('the app did not settle');
};

const openThread = async (page, name) => {
  await page.evaluate((n) => { const a = [...document.querySelectorAll('.ca-rail-channels a')].find((x) => x.textContent.includes(n)); a && a.click(); }, name);
  await wait(1200);
};

const setupRoom = async (pages) => {
  const [first, ...rest] = pages;
  const sid = await first.evaluate(async () => { await window.__zellous.servers.create('catchup-' + Date.now().toString(36)); return window.state.currentServerId; }).catch(async () => { await first.waitForFunction(() => window.appReady === true); await wait(3000); return first.evaluate(() => window.state.currentServerId); });
  await wait(3000);
  for (const p of rest) { await p.evaluate(async (s) => { await window.__zellous.servers.join(s, { name: 'catchup' }); }, sid); await wait(2500); }
  await first.evaluate(() => window.channelManager.showCreateModal(null, null));
  await wait(400);
  await first.selectOption('#ccType', 'voice-thread');
  await first.fill('#ccName', 'thread-one');
  await first.locator('#ccSubmit').click();
  await wait(4000);
  for (const p of pages) await openThread(p, 'thread-one');
};

const joinAll = (pages) => Promise.all(pages.map((p) => p.locator('.ds-g3-vtbar .ds-g3-evb', { hasText: 'Join thread' }).click()));

const fetchCapture = async (page) => {
  const total = JSON.parse(await page.evaluate(() => window.__capMeta())).total;
  const blocks = [];
  for (let from = 0; from < total; from += 300) blocks.push(...JSON.parse(await page.evaluate(([f, n]) => window.__capSlice(f, n), [from, 300])));
  const elements = JSON.parse(await page.evaluate(() => window.__capMeta())).elements;
  return JSON.stringify({ elements, blocks });
};

const decodeCapture = (dump) => {
  const parsed = JSON.parse(dump);
  const streams = new Map();
  for (const b of parsed.blocks) {
    const raw = Buffer.from(b.data, 'base64');
    const data = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
    const copy = Float32Array.from(data);
    if (!streams.has(b.id)) streams.set(b.id, []);
    streams.get(b.id).push({ at: b.at, audible: !b.muted && !b.paused, rate: b.rate, data: copy });
  }
  return { elements: parsed.elements, streams };
};

const trimSilence = (samples) => {
  const block = 320;
  const level = (i) => { let e = 0; for (let k = i; k < Math.min(samples.length, i + block); k++) e += samples[k] * samples[k]; return Math.sqrt(e / block); };
  let peak = 0;
  for (let i = 0; i < samples.length; i += block) peak = Math.max(peak, level(i));
  const floor = Math.max(peak * 0.05, 0.004);
  let from = 0;
  while (from < samples.length && level(from) < floor) from += block;
  let to = samples.length;
  while (to > from && level(Math.max(0, to - block)) < floor) to -= block;
  return samples.subarray(Math.max(0, from - 1600), Math.min(samples.length, to + 1600));
};

const receivedStream = ({ elements, streams }) => {
  const parts = [];
  for (const [id, blocks] of streams) if (elements[id].live) for (const b of blocks) parts.push(b);
  parts.sort((x, y) => x.at - y.at);
  return trimSilence(join(...parts.map((b) => b.data)));
};

const audibleSegments = ({ elements, streams }, minSeconds = 0.8) => {
  const segments = [];
  for (const [id, blocks] of streams) {
    let current = null;
    let previous = null;
    for (const b of blocks) {
      if (b.audible) {
        if (current && previous && b.at - previous > 200) current = null;
        previous = b.at;
        if (!current) { current = { id, live: elements[id].live, peer: elements[id].peer, start: b.at, parts: [], rate: b.rate }; segments.push(current); }
        current.parts.push(b.data);
        current.end = b.at;
      } else current = null;
    }
  }
  return segments.map((s) => ({ ...s, samples: trimSilence(join(...s.parts)) })).filter((s) => s.samples.length >= 16000 * minSeconds).sort((a, b) => a.start - b.start);
};

const lagSeconds = (text) => { const m = /(?:(\d+):)?([\d.]+)\s*s?\s*behind/.exec(text || ''); return m ? (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]) : null; };

const analyseTimeline = (timeline) => {
  const edges = { ownStart: null, ownEnd: null };
  timeline.forEach((t, i) => {
    if (t.ownTalk && edges.ownStart === null) edges.ownStart = i;
    if (t.ownTalk) edges.ownEnd = i + 1;
  });
  const lagBefore = (() => { for (let i = (edges.ownEnd ?? timeline.length) - 1; i >= 0; i--) { const v = lagSeconds(timeline[i].lanes.map((l) => l.lag).join(' ')); if (v !== null) return v; } return null; })();
  const lagAfter = (() => { for (let i = edges.ownEnd ?? 0; i < Math.min(timeline.length, (edges.ownEnd ?? 0) + 6); i++) { const v = lagSeconds(timeline[i].lanes.map((l) => l.lag).join(' ')); if (v !== null) return v; } return null; })();
  let liveAt = null;
  for (let i = edges.ownEnd ?? 0; i < timeline.length; i++) if (timeline[i].gate === true && timeline[i].lanes.every((l) => !/behind|catching/.test(l.lag))) { liveAt = i; break; }
  const catchStart = (() => { for (let i = edges.ownEnd ?? 0; i < timeline.length; i++) if (timeline[i].gate === false || /catching/.test(timeline[i].lanes.map((l) => l.lag).join(' '))) return i; return null; })();
  const ms = (a, b) => (a === null || b === null ? null : Math.round(timeline[b].at - timeline[a].at));
  return { edges, ownTalkMs: ms(edges.ownStart, edges.ownEnd), lagBeforeS: lagBefore, lagAfterS: lagAfter, timeToLiveMs: ms(edges.ownEnd, liveAt), catchUpMs: ms(catchStart, liveAt), liveAt };
};

const screenshots = async (page, name, seen) => {
  const states = [['own-talk', /You are talking/], ['catching-up', /catching up/]];
  for (const [label, pattern] of states) {
    if (seen.has(label)) continue;
    const text = await page.evaluate(() => document.querySelector('.ds-g3-vt')?.textContent || '').catch(() => '');
    if (!pattern.test(text)) continue;
    seen.add(label);
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await wait(500);
      const file = path.join(WORK, name + '-' + label + '-' + w + 'x' + h + '.png');
      await page.screenshot({ path: file });
      const lane = await page.evaluate(() => [...document.querySelectorAll('.ds-g3-vtlane')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()).join(' | ')).catch(() => '');
      console.log('      screenshot ' + file + ' lanes: ' + lane.slice(0, 160));
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
};

const runPair = async ({ name, mics, pollMs = 50, extraWaitS = 0, shots = false, keys = {}, uplinks = {} }) => {
  console.log('--- scenario ' + name);
  if (process.env.REANALYSE) {
    const dir = process.env.REANALYSE;
    return { timeline: JSON.parse(fs.readFileSync(path.join(dir, name + '-timeline.json'), 'utf8')), capture: decodeCapture(fs.readFileSync(path.join(dir, name + '-capture.json'), 'utf8')), identities: fs.existsSync(path.join(dir, name + '-identities.json')) ? JSON.parse(fs.readFileSync(path.join(dir, name + '-identities.json'), 'utf8')) : {} };
  }
  const files = Object.fromEntries(Object.entries(mics).map(([k, v]) => [k, writeMic(name + '-' + k, v)]));
  const browsers = {};
  for (const k of Object.keys(mics)) browsers[k] = await chromium.launch(launchOptions(files[k]));
  try {
    const pages = {};
    for (const k of Object.keys(mics)) pages[k] = await boot(browsers[k], { ...(k === 'R' ? { capture: true, poll: pollMs } : {}), key: keys[k] || null, role: k, uplink: uplinks[k] || null });
    const identities = {};
    for (const k of Object.keys(mics)) identities[k] = await pages[k].evaluate(() => ({ pubkey: window.state.nostrPubkey, short: window.auth.npubShort() }));
    fs.writeFileSync(path.join(WORK, name + '-identities.json'), JSON.stringify(identities));
    const order = ['R', ...Object.keys(mics).filter((k) => k !== 'R')];
    await setupRoom(order.map((k) => pages[k]));
    await joinAll(order.map((k) => pages[k]));
    await wait(2000);
    const total = Math.max(...Object.values(mics).map((m) => m.length / RATE)) + 4;
    const seen = new Set();
    const until = Date.now() + (total + 10 + extraWaitS) * 1000;
    while (Date.now() < until) { if (shots) await screenshots(pages.R, name, seen); await wait(shots ? 300 : 1000); }
    const timeline = await pages.R.evaluate(() => window.__timeline);
    fs.writeFileSync(path.join(WORK, name + '-timeline.json'), JSON.stringify(timeline));
    for (const k of Object.keys(mics)) fs.writeFileSync(path.join(WORK, name + '-events-' + k + '.json'), JSON.stringify(await pages[k].evaluate(() => window.__voiceEvents || [])));
    const tapLog = await pages.R.evaluate(() => window.__tapLog || []);
    fs.writeFileSync(path.join(WORK, name + '-taplog.json'), JSON.stringify(tapLog));
    const dump = await fetchCapture(pages.R);
    fs.writeFileSync(path.join(WORK, name + '-capture.json'), dump);
    return { timeline, capture: decodeCapture(dump), identities };
  } finally {
    for (const b of Object.values(browsers)) await b.close().catch(() => {});
  }
};

const frameMs = (n) => Math.round(n / 16);

const boundaries = (segments, r) => {
  const out = [];
  let frames = 0;
  const per = Math.round(HOP_MS * 16);
  for (let k = 0; k < segments.length - 1; k++) {
    frames += Math.floor(segments[k].samples.length / per);
    const before = r.path.filter(([i]) => i <= frames - 1).at(-1);
    const after = r.path.find(([i]) => i >= frames);
    if (before && after) out.push({ from: segments[k].live ? 'live' : 'clip', to: segments[k + 1].live ? 'live' : 'clip', sourceBeforeMs: Math.round(before[1] * HOP_MS), sourceAfterMs: Math.round(after[1] * HOP_MS) });
  }
  return out;
};

const printHeard = (segments, r, t0) => {
  for (const seg of segments) console.log('      segment ' + (seg.live ? 'live ' : 'clip ') + 'start=' + Math.round(seg.start - t0) + 'ms dur=' + frameMs(seg.samples.length) + 'ms');
  console.log('      aligned to source ' + Math.round(r.startMs) + '..' + Math.round(r.endMs) + ' ms, mean voiced cost ' + r.meanVoicedCost.toFixed(2) + ', gap windows ' + JSON.stringify(r.gapWindows));
  if (process.env.DEBUG_ENERGY) for (const w of r.gapWindows) { const cells = r.path.filter(([, j]) => Math.floor((j * HOP_MS) / 1000) === w); if (!cells.length) continue; const i0 = cells[0][0] - 12; const i1 = cells.at(-1)[0] + 12; console.log('      heard dB ' + i0 + '..' + i1 + ': ' + Array.from(r.heardEnergy.slice(i0, i1)).map((v) => Math.round(v)).join(' ')); const j0 = cells[0][1] - 12; const j1 = cells.at(-1)[1] + 12; console.log('      source dB ' + j0 + '..' + j1 + ': ' + Array.from(r.sourceEnergy.slice(j0, j1)).map((v) => Math.round(v)).join(' ')); }
  for (const w of r.gapWindows) console.log('      gap window ' + w + ' path ' + r.path.filter(([, j]) => Math.floor((j * HOP_MS) / 1000) === w).map(([i, j]) => i + ':' + j).join(' '));
  console.log('      windows ' + r.windows.map((w) => w.second + ':' + w.voiced + '/' + (w.cost === null ? '-' : w.cost.toFixed(1))).join(' '));
};

const timelineReport = (label, tl) => {
  console.log('      timeline ' + JSON.stringify({ ownTalkMs: tl.ownTalkMs, lagAtEndOfOwnTalkS: tl.lagBeforeS, lagJustAfterS: tl.lagAfterS, catchUpMs: tl.catchUpMs, timeToLiveMs: tl.timeToLiveMs }));
  report(tl.edges.ownStart !== null && tl.ownTalkMs > 3000, label + ': the receiver talked ' + tl.ownTalkMs + ' ms');
  report(tl.lagBeforeS !== null && tl.lagBeforeS > 2, label + ': lag shown at the end of own talk ' + tl.lagBeforeS + ' s');
  report(tl.timeToLiveMs !== null, label + ': live again ' + tl.timeToLiveMs + ' ms after own talk ended (catch-up ' + tl.catchUpMs + ' ms)');
};

const chunkedContinuity = (heard, source, chunkSeconds = 30) => {
  const sourceFeatures = features(source);
  const chunk = chunkSeconds * 16000;
  const results = [];
  let lastEndFrame = null;
  for (let off = 0; off + 16000 * 5 <= heard.length; off += chunk) {
    const piece = heard.subarray(off, Math.min(heard.length, off + chunk));
    const lo = lastEndFrame === null ? 0 : Math.max(0, Math.floor(lastEndFrame * HOP - 16000 * 2));
    const region = source.subarray(lo, lastEndFrame === null ? source.length : Math.min(source.length, lo + (chunkSeconds * 3 + 10) * 16000));
    const r = align(piece, region);
    const startFrame = Math.round(lo / HOP + r.startMs / HOP_MS);
    const endFrame = Math.round(lo / HOP + r.endMs / HOP_MS);
    let skippedVoiced = 0;
    if (lastEndFrame !== null) for (let j = lastEndFrame + 1; j < startFrame; j++) if (!sourceFeatures.silent[j]) skippedVoiced++;
    results.push({ startMs: Math.round(startFrame * HOP_MS), endMs: Math.round(endFrame * HOP_MS), cost: r.meanVoicedCost, gapWindows: r.gapWindows.length, skippedVoiced });
    lastEndFrame = endFrame;
  }
  return results;
};

const base64Parts = (samples, partBytes = 3 * 1024 * 1024) => {
  const bytes = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const parts = [];
  for (let off = 0; off < bytes.length; off += partBytes) parts.push(bytes.subarray(off, Math.min(bytes.length, off + partBytes)).toString('base64'));
  return parts;
};

const runInPage = async ({ sources, rate, own, endSpeakMs, minRunMs, maxRunMs, pollMs = 50 }) => {
  const browser = await chromium.launch(launchOptions(null));
  try {
    const page = await (await browser.newContext()).newPage();
    page.setDefaultTimeout(0);
    page.on('pageerror', (e) => console.log('      pageerror', e.message));
    await page.addInitScript(captureInit);
    await page.goto('http://127.0.0.1:' + PORT + '/');
    for (const [key, samples] of Object.entries(sources)) {
      const parts = base64Parts(samples);
      for (let i = 0; i < parts.length; i++) await page.evaluate(([k, part]) => { (window.__parts ||= {})[k] = (window.__parts[k] || []).concat(part); }, [key, parts[i]]);
    }
    await page.evaluate(async ({ rate, own, endSpeakMs, minRunMs, maxRunMs, pollMs }) => {
      window.__run = { done: false, error: null };
      const mod = await import('/deps/wireweave/src/modules/voice-thread.js');
      const vad = await import('/deps/wireweave/src/vad/index.js');
      const decode = (parts) => { const chunks = parts.map((x) => { const bin = atob(x); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }); const total = chunks.reduce((n, c) => n + c.length, 0); const all = new Uint8Array(total); let at = 0; for (const c of chunks) { all.set(c, at); at += c.length; } return new Float32Array(all.buffer); };
      const ctx = new AudioContext({ sampleRate: 48000 });
      const voice = new EventTarget();
      const streams = {};
      const buffers = {};
      const monitors = {};
      for (const [key, parts] of Object.entries(window.__parts)) {
        const data = decode(parts);
        const buffer = ctx.createBuffer(1, data.length, rate);
        buffer.copyToChannel(data, 0);
        const dest = ctx.createMediaStreamDestination();
        streams[key] = dest.stream;
        buffers[key] = { buffer, dest };
        const el = new Audio();
        el.srcObject = dest.stream;
        el.__peerKey = key;
        monitors[key] = el;
      }
      window.__parts = null;
      voice.peers = new Map(Object.keys(streams).map((k) => [k, {}]));
      voice.participants = new Map();
      voice.getRemoteStream = (k) => streams[k];
      voice.audioContext = () => ctx;
      voice.requestTransmit = () => true;
      voice.releaseTransmit = () => {};
      voice.setLivePlayback = (open) => { for (const el of Object.values(monitors)) el.muted = !open; };
      const base = mod.createBlobPlayer();
      const player = { play(clip) { const h = base.play(clip); h.audio.__peerKey = clip.speaker; return h; } };
      const warnings = [];
      const bound = mod.createVoiceThread({ voice, player, vadLoader: vad.createRnnoiseLoader(() => import('/vendor/rnnoise/dist/generated/rnnoise-sync.js')), onWarning: (m) => warnings.push(m) });
      for (const el of Object.values(monitors)) el.play().catch(() => {});
      await new Promise((r) => setTimeout(r, 3000));
      const start = performance.now();
      const timeline = [];
      const marks = [];
      const lanesOf = (s) => s.lanes.map((l) => ({ speaker: l.speaker, state: l.stretch && l.stretch.state, lagMs: l.stretch && l.stretch.lagMs, droppedVoicedMs: l.stretch && l.stretch.droppedVoicedMs, droppedMs: l.stretch && l.stretch.droppedMs }));
      const speak = (key, on) => voice.dispatchEvent(new CustomEvent('speaker', { detail: { key, isLocal: false, speaking: on } }));
      const ownEvent = (on) => {
        marks.push({ at: performance.now() - start, type: on ? 'own-talk-start' : 'own-talk-end', lanes: lanesOf(bound.thread.snapshot()) });
        voice.dispatchEvent(new CustomEvent('speaker', { detail: { key: 'local', isLocal: true, speaking: on } }));
      };
      const poll = setInterval(() => {
        const s = bound.thread.snapshot();
        timeline.push({ at: performance.now() - start, gate: s.gateOpen, mode: s.mode, lanes: lanesOf(s) });
      }, pollMs);
      for (const key of Object.keys(streams)) {
        buffers[key].node = ctx.createBufferSource();
        buffers[key].node.buffer = buffers[key].buffer;
        buffers[key].node.connect(buffers[key].dest);
        buffers[key].node.start(ctx.currentTime + 0.2);
        setTimeout(() => speak(key, true), 200);
        setTimeout(() => speak(key, false), endSpeakMs + 200);
      }
      for (const [on, off] of own) { setTimeout(() => ownEvent(true), on); setTimeout(() => ownEvent(false), off); }
      const finalOff = own[own.length - 1][1];
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      await sleep(finalOff + 1000);
      for (let waited = 0; performance.now() - start < maxRunMs; waited += 200) {
        const s = bound.thread.snapshot();
        if (s.gateOpen && s.lanes.every((l) => !l.stretch || l.stretch.state === 'live') && performance.now() - start > minRunMs) break;
        await sleep(200);
      }
      await sleep(2500);
      clearInterval(poll);
      window.__run = { done: true, timeline, marks, warnings };
    }, { rate, own, endSpeakMs, minRunMs, maxRunMs, pollMs });
    await page.waitForFunction(() => window.__run && window.__run.done, null, { polling: 1000, timeout: 0 });
    const result = await page.evaluate(() => JSON.stringify(window.__run));
    const dump = await fetchCapture(page);
    fs.writeFileSync(path.join(WORK, 'in-page-capture.json'), dump);
    const capture = decodeCapture(dump);
    fs.writeFileSync(path.join(WORK, 'in-page-run.json'), result);
    return { ...JSON.parse(result), capture };
  } finally { await browser.close().catch(() => {}); }
};


const withoutRepeats = (segments, source) => {
  const parts = [];
  let previousEnd = null;
  for (const seg of segments) {
    if (previousEnd === null) {
      const first = align(seg.samples, source);
      parts.push(seg.samples);
      previousEnd = Math.round(first.endMs / HOP_MS);
      continue;
    }
    const lo = Math.max(0, previousEnd - Math.round(REPEAT_WINDOW_MS / HOP_MS));
    const region = source.subarray(lo * HOP, Math.min(source.length, (lo + Math.round((seg.samples.length / HOP) * 2.2) + 100) * HOP));
    const r = align(seg.samples, region);
    const firstNew = r.path.find(([, j]) => lo + j >= previousEnd);
    const cut = firstNew ? firstNew[0] * HOP : 0;
    parts.push(seg.samples.subarray(cut));
    previousEnd = Math.max(previousEnd, lo + Math.round(r.endMs / HOP_MS));
  }
  return join(...parts);
};

const netMissing = (runs, floor) => {
  const kept = runs.filter(([x, y]) => !floor.some(([fx, fy]) => x <= fy + 30 && y >= fx - 30));
  return { runs: kept, ms: kept.reduce((n, [x, y]) => n + (y - x) + 10, 0) };
};

const baselineInterrupt = async () => {
  const a = speech(20, 0, 0);
  const run = await runPair({ name: 'baseline-interrupt', shots: false, extraWaitS: 2, mics: { A: join(silence(LEAD_S), a, silence(8)), R: silence(LEAD_S + 30) } });
  const short = run.identities.A.pubkey.slice(0, 8);
  const own = audibleSegments(run.capture, 0.25).filter((seg) => seg.live && seg.peer && seg.peer.startsWith(short));
  const r = unionCoverage(own.map((seg) => seg.samples), toRate16k(a, RATE));
  console.log('      NOISE_FLOOR interrupt source ' + JSON.stringify(r.missingRuns) + ' over ' + Math.round(r.startMs) + '..' + Math.round(r.endMs) + ' ms');
  return r.missingRuns;
};

const summariseRun = (result, keys, label) => {
  for (const m of result.marks) console.log('      ' + m.type + ' at ' + Math.round(m.at) + ' ms lanes ' + m.lanes.map((l) => l.speaker + ' ' + l.state + ' ' + Math.round(l.lagMs || 0) + 'ms').join(', '));
  if (result.warnings.length) console.log('      warnings ' + JSON.stringify(result.warnings));
  const ends = result.marks.filter((m) => m.type === 'own-talk-end');
  const starts = result.marks.filter((m) => m.type === 'own-talk-start');
  const finalEnd = ends[ends.length - 1].at;
  const liveAt = result.timeline.find((t) => t.at > finalEnd && t.gate && t.lanes.every((l) => l.state === 'live'));
  const lagOf = (m, key) => Math.round((m.lanes.find((l) => l.speaker === key) || {}).lagMs || 0);
  const peaks = Object.fromEntries(keys.map((key) => [key, Math.round(Math.max(...result.timeline.map((t) => (t.lanes.find((l) => l.speaker === key) || {}).lagMs || 0)))]));
  const dropped = Object.fromEntries(keys.map((key) => [key, Math.round(Math.max(...result.timeline.map((t) => (t.lanes.find((l) => l.speaker === key) || {}).droppedVoicedMs || 0)))]));
  const droppedAll = Object.fromEntries(keys.map((key) => [key, Math.round(Math.max(...result.timeline.map((t) => (t.lanes.find((l) => l.speaker === key) || {}).droppedMs || 0)))]));
  console.log('      lag at end of first own talk: ' + keys.map((k) => k + ' ' + lagOf(ends[0], k) + ' ms').join(', ') + '; at the last interruption: ' + keys.map((k) => k + ' ' + lagOf(starts[starts.length - 1], k) + ' ms').join(', ') + '; peak lag ' + JSON.stringify(peaks) + '; dropped voiced ' + JSON.stringify(dropped) + ', dropped in all ' + JSON.stringify(droppedAll));
  const trace = []; let lastAt = -1e9;
  for (const t of result.timeline) if (t.at - lastAt >= 30000) { lastAt = t.at; trace.push(Math.round(t.at / 1000) + 's:' + t.lanes.map((l) => (l.state || '-') + ' ' + Math.round((l.lagMs || 0) / 1000)).join('/') + (t.gate ? ' gate' : '')); }
  console.log('      lane trace ' + trace.join(' | '));
  console.log('      time to live after the final own talk ended: ' + (liveAt ? Math.round(liveAt.at - finalEnd) : null) + ' ms');
  return { ends, starts, finalEnd, liveAt, lagOf, peaks, dropped };
};

const scenarios = {
  async interrupt(runName = 'interrupt', quiet = false, floor = []) {
    const a = speech(20, 0, 0);
    const b = speech(5, 30);
    const run = await runPair({ name: runName, shots: !quiet, mics: { A: join(silence(LEAD_S), a, silence(8)), R: join(silence(LEAD_S + 7), b, silence(14)) } });
    const tl = analyseTimeline(run.timeline);
    const segments = audibleSegments(run.capture, Number(process.env.MIN_SEG_S || 0.25));
    const source = toRate16k(a, RATE);
    const r = align(withoutRepeats(segments, source), source);
    printHeard(segments, r, run.timeline[0].at);
    if (process.env.DEBUG_SEGS) for (const seg of segments) { const one = align(seg.samples, source); console.log('      seg ' + (seg.live ? 'live' : 'clip') + ' dur ' + frameMs(seg.samples.length) + ' aligned source ' + Math.round(one.startMs) + '..' + Math.round(one.endMs) + ' cost ' + one.meanVoicedCost.toFixed(2)); }
    for (const bd of boundaries(segments, r)) console.log('      boundary ' + bd.from + '->' + bd.to + ' source ' + bd.sourceBeforeMs + ' -> ' + bd.sourceAfterMs + ' ms');
    timelineReport('interrupt', tl);
    const received = align(receivedStream(run.capture), source);
    const planted = Number(process.env.PLANT_CUT_MS || 0);
    const heardSegments = segments.map((seg, i) => (planted && i === 2 ? join(seg.samples.subarray(0, Number(process.env.PLANT_AT_MS || 2000) * 16), seg.samples.subarray(Number(process.env.PLANT_AT_MS || 2000) * 16 + Math.round(planted * 16))) : seg.samples));
    const unionRaw = unionCoverage(heardSegments, source);
    const net = netMissing(unionRaw.missingRuns, floor);
    const union = { ...unionRaw, missingRuns: net.runs, missingVoicedMs: net.ms };
    const metrics = { run: runName, playedMissingVoicedMs: union.missingVoicedMs, playedLongestMissingMs: r.longestMissingRunMs, receivedMissingVoicedMs: received.missingVoicedMs, receivedLongestMissingMs: received.longestMissingRunMs };
    console.log('      RUN_METRICS ' + JSON.stringify(metrics));
    if (process.env.DEBUG_COST) for (const [a, b] of r.missingRuns) console.log('      cost ' + a + '..' + b + ': ' + Array.from(r.costAt.slice(Math.round(a / HOP_MS) - 4, Math.round(b / HOP_MS) + 4)).map((c) => c.toFixed(0)).join(' '));
    console.log('      MISSING_RUNS played ' + JSON.stringify(union.missingRuns) + ' (sequential ' + JSON.stringify(r.missingRuns) + ') received ' + JSON.stringify(received.missingRuns));
    console.log('      the stream as received (muted or not) aligned to source ' + Math.round(received.startMs) + '..' + Math.round(received.endMs) + ' ms, cost ' + received.meanVoicedCost.toFixed(2) + ', windows damaged before our code saw them: [' + received.gapWindows.join(',') + '] and cost>6 at [' + received.windows.filter((w) => w.cost !== null && w.cost > 6).map((w) => w.second).join(',') + ']');
    const damaged = new Set(received.windows.filter((w) => w.voiced >= 10 && (w.cost === null || w.cost > 6)).map((w) => w.second));
    const ours = r.gapWindows.filter((w) => !damaged.has(w));
    report(segments.some((seg) => !seg.live), 'interrupt: a catch-up segment played');
    report(ours.length === 0, 'interrupt: no voiced source second is missing that the received stream itself had (heard gap windows ' + r.gapWindows.join(',') + ', of which damaged in transit ' + r.gapWindows.filter((w) => damaged.has(w)).join(',') + ')');
    report(r.endMs - r.startMs > 15000, 'interrupt: the played audio spans ' + Math.round((r.endMs - r.startMs) / 1000) + ' s of the 20 s source');
    const control = align(join(...segments.filter((seg) => seg.live).map((seg) => seg.samples)), source);
    report(control.endMs - control.startMs < 12000, 'interrupt: control, without the catch-up segments the heard audio spans only ' + Math.round((control.endMs - control.startMs) / 1000) + ' s of the 20 s source');
    report(union.missingVoicedMs <= MISSING_VOICED_LIMIT_MS, 'interrupt: ' + runName + ' missing voiced audio ' + union.missingVoicedMs + ' ms (longest run ' + r.longestMissingRunMs + ' ms, limit ' + MISSING_VOICED_LIMIT_MS + '; the received stream itself misses ' + received.missingVoicedMs + ' ms)');
    return metrics;
  },

  async interrupt10() {
    process.env.LOCK_RATE ||= '1';
    const table = [];
    const floor = process.env.REANALYSE ? JSON.parse(process.env.NOISE_FLOOR || '[]') : await baselineInterrupt();
    for (let n = 1; n <= 10; n++) table.push(await scenarios.interrupt('interrupt-' + n, true, floor));
    console.log('      RUN_TABLE run played_missing_ms played_longest_ms received_missing_ms');
    for (const m of table) console.log('      RUN_TABLE ' + m.run + ' ' + m.playedMissingVoicedMs + ' ' + m.playedLongestMissingMs + ' ' + m.receivedMissingVoicedMs);
    report(table.length === 10 && table.every((m) => m.playedMissingVoicedMs <= MISSING_VOICED_LIMIT_MS), 'interrupt10: every run missed at most ' + MISSING_VOICED_LIMIT_MS + ' ms of voiced audio (worst ' + Math.max(...table.map((m) => m.playedMissingVoicedMs)) + ' ms)');
  },

  async metric() {
    console.log('--- scenario metric');
    const source = toRate16k(speech(26, 7, 350), RATE);
    const at = (s) => Math.round(s * 16000);
    const noisy = (x) => Float32Array.from(x, (v, i) => v * 0.9 + 0.0002 * Math.sin(i * 0.37));
    const cut = (from, to) => noisy(source.subarray(at(from), at(to)));
    const gaps = [[9.2, 12.4], [17.0, 19.0]];
    const heard = [cut(12.4, 17.0), cut(0, 6.0), cut(19.0, 24.0), cut(4.4, 9.2)];
    const sf = features(source);
    const expected = gaps.map(([a, b]) => { let n = 0; for (let j = Math.ceil(a * 100) + 2; j < Math.floor(b * 100) - 2; j++) if (sf.countable[j]) n++; return n * 10; });
    const r = unionCoverage(heard, source);
    console.log('      planted gaps ' + JSON.stringify(gaps) + ' voiced ms inside ' + JSON.stringify(expected) + ' reported runs ' + JSON.stringify(r.missingRuns));
    const inside = gaps.map(([a, b]) => r.missingRuns.filter(([x, y]) => x >= a * 1000 - 60 && y <= b * 1000 + 60).reduce((n, [x, y]) => n + (y - x), 0));
    const outside = r.missingRuns.filter(([x, y]) => !gaps.some(([a, b]) => x >= a * 1000 - 60 && y <= b * 1000 + 60));
    gaps.forEach((g, i) => report(Math.abs(inside[i] - expected[i]) <= 80, 'metric: planted gap ' + g[0] + '-' + g[1] + ' s holds ' + expected[i] + ' voiced ms, reported ' + inside[i] + ' ms'));
    report(outside.length === 0, 'metric: no missing run outside the planted gaps (' + JSON.stringify(outside) + ')');
    const clean = unionCoverage([cut(0, 9), cut(8, 17), cut(16.5, 24)], source);
    report(clean.missingVoicedMs === 0, 'metric: three overlapping reordered pieces with no gap report ' + clean.missingVoicedMs + ' ms missing ' + JSON.stringify(clean.missingRuns));
    const voicedAfter = (from, frames) => { for (let j = Math.floor(from * 100); j < sf.count - frames - 8; j++) { let ok = true; for (let k = 0; k < frames + 8; k++) if (!sf.countable[j + k]) { ok = false; break; } if (ok) return j + 4; } return -1; };
    const planted = [[voicedAfter(5, 10), 10], [voicedAfter(13, 6), 6], [voicedAfter(20, 4), 4]].sort((x, y) => x[0] - y[0]);
    const pieces = [];
    let cursor = 0;
    for (const [frame, length] of planted) { pieces.push(noisy(source.subarray(cursor * HOP, frame * HOP))); cursor = frame + length; }
    pieces.push(noisy(source.subarray(cursor * HOP, at(25))));
    const small = unionCoverage(pieces, source);
    const found = planted.map(([frame, length]) => small.missingRuns.filter(([x, y]) => x >= frame * 10 - 20 && y <= (frame + length) * 10 + 20).reduce((n, [x, y]) => n + (y - x) + 10, 0));
    report(planted.every(([, length], i) => Math.abs(found[i] - length * 10) <= 10) && small.missingRuns.length === 3, 'metric: planted gaps of ' + planted.map(([f, l]) => (l * 10) + ' ms at ' + (f * 10)).join(', ') + ' are reported as ' + JSON.stringify(small.missingRuns));
    const adjacent = unionCoverage([cut(10, 17), cut(0, 10), cut(17, 24)], source);
    report(adjacent.missingVoicedMs === 0, 'metric: three exactly adjacent pieces report ' + adjacent.missingVoicedMs + ' ms missing ' + JSON.stringify(adjacent.missingRuns));
  },

  async baseline3(hubRoleChoice = 'self') {
    const hubRole = hubRoleChoice === 'other' ? 'A' : 'R';
    const uplinks = { A: 200, B: 200, R: 200, [hubRole]: 60000 };
    const a = speech(16, 0, 0);
    const b = speech(14, 30, 0);
    const run = await runPair({ name: 'baseline3-' + hubRoleChoice, shots: false, extraWaitS: 4, uplinks, mics: { A: join(silence(LEAD_S), a, silence(24)), B: join(silence(LEAD_S + 18), b, silence(6)), R: silence(LEAD_S + 40) } });
    const short = Object.fromEntries(Object.entries(run.identities).map(([k, v]) => [k, v.pubkey.slice(0, 8)]));
    const segments = audibleSegments(run.capture, 0.25);
    const sources = { A: toRate16k(a, RATE), B: toRate16k(b, RATE) };
    const floors = {};
    for (const k of ['A', 'B']) {
      const own = segments.filter((seg) => seg.live && seg.peer && seg.peer.startsWith(short[k]));
      const r = unionCoverage(own.map((seg) => seg.samples), sources[k]);
      floors[k] = r.missingRuns;
      console.log('      BASELINE ' + k + ' live segments ' + own.length + ' span ' + Math.round(r.startMs) + '..' + Math.round(r.endMs) + ' missing ' + r.missingVoicedMs + ' ms runs ' + JSON.stringify(r.missingRuns));
    }
    return floors;
  },

  async three(runName = 'three', hubRoleChoice = process.env.HUB_ROLE, floors = { A: [], B: [] }) {
    const hubRole = hubRoleChoice === 'other' ? 'A' : 'R';
    const generated = Array.from({ length: 3 }, () => { const sk = generateSecretKey(); return { sk: Buffer.from(sk).toString('hex'), pk: getPublicKey(sk) }; }).sort((x, y) => (x.pk > y.pk ? -1 : 1));
    const keys = { [hubRole]: generated[0].sk, ...Object.fromEntries(['A', 'B', 'R'].filter((k) => k !== hubRole).map((k, i) => [k, generated[i + 1].sk])) };
    const a = speech(16, 0, 0);
    const b = speech(14, 30, 0);
    const own = speech(5, 60);
    const uplinks = { A: 200, B: 200, R: 200, [hubRole === 'R' ? 'R' : 'A']: 60000 };
    const run = await runPair({ name: runName, shots: false, extraWaitS: 30, keys, uplinks, mics: { A: join(silence(LEAD_S), a, silence(8)), B: join(silence(LEAD_S + 2), b, silence(8)), R: join(silence(LEAD_S + 7), own, silence(16)) } });
    const sources = { A: toRate16k(a, RATE), B: toRate16k(b, RATE) };
    const tl = analyseTimeline(run.timeline);
    timelineReport(runName, tl);
    const events = Object.fromEntries(['A', 'B', 'R'].map((k) => [k, JSON.parse(fs.readFileSync(path.join(WORK, runName + '-events-' + k + '.json'), 'utf8'))]));
    const lastHub = (k) => events[k].filter((e) => e.type === 'hub-changed').map((e) => JSON.parse(e.detail).hub).at(-1) || null;
    const short = Object.fromEntries(Object.entries(run.identities).map(([k, v]) => [k, v.pubkey.slice(0, 8)]));
    const hubViews = Object.fromEntries(['A', 'B', 'R'].map((k) => [k, Object.entries(short).find(([, pk]) => pk === lastHub(k))?.[0] || lastHub(k)]));
    console.log('      hub as seen by each peer ' + JSON.stringify(hubViews) + ' (final hub-changed event)');
    const segments = audibleSegments(run.capture, 0.25);
    const owner = (seg) => {
      if (seg.live) return Object.entries(short).find(([, pk]) => seg.peer && seg.peer.startsWith(pk))?.[0] || null;
      const costs = Object.fromEntries(Object.entries(sources).map(([k, src]) => [k, align(seg.samples, src).meanVoicedCost]));
      return costs.A <= costs.B ? 'A' : 'B';
    };
    const bySpeaker = { A: [], B: [] };
    for (const seg of segments) { const k = owner(seg); if (k && bySpeaker[k]) bySpeaker[k].push(seg); }
    const perSpeaker = {};
    for (const k of ['A', 'B']) {
      const segs = bySpeaker[k].sort((x, y) => x.start - y.start);
      console.log('      speaker ' + k + ' segments ' + segs.map((seg) => (seg.live ? 'live' : 'clip') + '@' + Math.round(seg.start - run.timeline[0].at) + ':' + frameMs(seg.samples.length)).join(' '));
      if (process.env.DEBUG_SEGS) for (const seg of segs) { const one = align(seg.samples, sources[k]); console.log('      seg ' + k + ' ' + (seg.live ? 'live' : 'clip') + ' start ' + Math.round(seg.start - run.timeline[0].at) + ' dur ' + frameMs(seg.samples.length) + ' source ' + Math.round(one.startMs) + '..' + Math.round(one.endMs) + ' cost ' + one.meanVoicedCost.toFixed(2)); }
      const rawUnion = unionCoverage(segs.map((seg) => seg.samples), sources[k]);
      const net = netMissing(rawUnion.missingRuns, floors[k]);
      const r = { ...rawUnion, missingRuns: net.runs, missingVoicedMs: net.ms };
      r.meanVoicedCost = 0;
      r.gapWindows = [];
      console.log('      speaker ' + k + ' aligned ' + Math.round(r.startMs) + '..' + Math.round(r.endMs) + ' ms cost ' + r.meanVoicedCost.toFixed(2) + ' gap windows [' + r.gapWindows + '] MISSING_RUNS ' + JSON.stringify(r.missingRuns));
      perSpeaker[k] = { missingMs: r.missingVoicedMs, runs: r.missingRuns, spanS: Math.round((r.endMs - r.startMs) / 1000) };
      report(r.missingVoicedMs <= MISSING_VOICED_LIMIT_MS && r.endMs - r.startMs > sources[k].length / 16 * 0.75, 'three: speaker ' + k + ' missed ' + r.missingVoicedMs + ' ms of voiced audio across ' + Math.round((r.endMs - r.startMs) / 1000) + ' s (limit ' + MISSING_VOICED_LIMIT_MS + ')');
    }
    const ownStart = run.timeline.find((t) => t.ownTalk);
    report(!!bySpeaker.A.find((seg) => seg.live && ownStart && seg.start < ownStart.at), 'three: speaker A was heard live while we were idle');
    report(bySpeaker.B.some((seg) => !seg.live), 'three: speaker B was queued and played after the live speech');
    const stacked = run.timeline.filter((t) => t.ownTalk && t.lanes.filter((l) => /behind|catching/.test(l.lag)).length >= 2);
    report(stacked.length > 0, 'three: while we talked ' + (stacked[0] ? stacked[0].lanes.length : 0) + ' lanes stacked behind (' + stacked.length + ' samples with two lanes behind)');
    const laneNames = new Set(run.timeline.flatMap((t) => t.lanes.map((l) => l.name)));
    report(laneNames.size >= 2, 'three: per-speaker lanes ' + [...laneNames].join(', '));
    const hubIsInterrupter = hubRole === 'R' ? Object.values(hubViews).filter((v) => v === 'R').length : null;
    console.log('      interrupter was hub in ' + hubIsInterrupter + ' of 3 views (HUB_ROLE ' + (process.env.HUB_ROLE || 'self') + ')');
    return { run: runName, hubViews, interrupterIsHub: hubViews.R === 'R', perSpeaker };
  },

  async three10() {
    process.env.LOCK_RATE ||= '1';
    const table = [];
    const floors = { self: await scenarios.baseline3('self'), other: await scenarios.baseline3('other') };
    for (const role of ['self', 'other']) for (let n = 1; n <= 5; n++) table.push(await scenarios.three('three-' + role + '-' + n, role, floors[role]));
    console.log('      THREE_TABLE run hub_views interrupter_is_hub A_missing_ms B_missing_ms');
    for (const m of table) console.log('      THREE_TABLE ' + m.run + ' ' + JSON.stringify(m.hubViews) + ' ' + m.interrupterIsHub + ' ' + m.perSpeaker.A.missingMs + ' ' + m.perSpeaker.B.missingMs);
    report(table.every((m) => m.perSpeaker.A.missingMs <= MISSING_VOICED_LIMIT_MS && m.perSpeaker.B.missingMs <= MISSING_VOICED_LIMIT_MS), 'three10: every run missed at most ' + MISSING_VOICED_LIMIT_MS + ' ms per speaker');
  },

  async two() {
    console.log('--- scenario two');
    const a = speech(20, 0);
    const b = speech(20, 40);
    const sources = { 'spk-a': toRate16k(a, RATE), 'spk-b': toRate16k(b, RATE) };
    const keys = Object.keys(sources);
    const result = await runInPage({ sources, rate: 16000, own: [[8000, 13000], [15600, 17600]], endSpeakMs: 20000, minRunMs: 21500, maxRunMs: 90000 });
    const sum = summariseRun(result, keys);
    const segments = audibleSegments(result.capture);
    report(sum.ends.length === 2 && keys.every((k) => sum.lagOf(sum.ends[0], k) > 3000), 'two: both lanes were ' + keys.map((k) => sum.lagOf(sum.ends[0], k)).join(' and ') + ' ms behind when we stopped talking');
    report(keys.every((k) => sum.lagOf(sum.starts[1], k) > 0), 'two: the re-interruption left each lane its own remainder (' + keys.map((k) => sum.lagOf(sum.starts[1], k)).join(' and ') + ' ms)');
    report(!!sum.liveAt, 'two: both lanes live again ' + (sum.liveAt ? Math.round(sum.liveAt.at - sum.finalEnd) : null) + ' ms after the last interruption');
    for (const key of keys) {
      const segs = segments.filter((seg) => seg.peer === key).sort((x, y) => x.start - y.start);
      const r = align(join(...segs.map((seg) => seg.samples)), sources[key]);
      console.log('      speaker ' + key + ' segments ' + segs.map((seg) => (seg.live ? 'live' : 'clip') + ':' + frameMs(seg.samples.length)).join(' '));
      printHeard(segs, r, 0);
      console.log('      MISSING_RUNS ' + key + ' ' + JSON.stringify(r.missingRuns));
      report(segs.some((seg) => !seg.live), 'two: ' + key + ' had its own catch-up playback');
      report(r.gapWindows.length === 0 && r.endMs - r.startMs > 17000, 'two: ' + key + ' heard in order without a content gap across ' + Math.round((r.endMs - r.startMs) / 1000) + ' s of its source (gap windows: ' + r.gapWindows.join(',') + ')');
    }
  },

  async cap() {
    console.log('--- scenario cap');
    const a = speech(430, 0, 100);
    const source = toRate16k(a, RATE);
    const result = await runInPage({ sources: { 'spk-a': source }, rate: 16000, own: [[14000, 414000]], endSpeakMs: 430000, minRunMs: 440000, maxRunMs: 900000, pollMs: 250 });
    const sum = summariseRun(result, ['spk-a']);
    const segments = audibleSegments(result.capture);
    const clips = segments.filter((seg) => !seg.live);
    console.log('      clip segments ' + clips.length + ', heard ' + Math.round(clips.reduce((n, seg) => n + seg.samples.length, 0) / 16000) + ' s of catch-up audio, first ' + clips.slice(0, 4).map((seg) => frameMs(seg.samples.length)).join(',') + ' ms');
    const heard = join(...clips.map((seg) => seg.samples));
    const chunks = chunkedContinuity(heard, source);
    for (const c of chunks) console.log('      chunk source ' + c.startMs + '..' + c.endMs + ' ms cost ' + c.cost.toFixed(2) + ' loud source frames skipped before ' + c.skippedVoiced);
    const droppedS = Math.round(sum.dropped['spk-a'] / 1000);
    report(sum.peaks['spk-a'] > 295000 && sum.peaks['spk-a'] <= 305000, 'cap: the lag stops at the 5 minute cap (peak ' + Math.round(sum.peaks['spk-a'] / 1000) + ' s)');
    report(droppedS > 0, 'cap: the lane reports ' + droppedS + ' s of voiced audio dropped');
    report(!!sum.liveAt, 'cap: live again ' + (sum.liveAt ? Math.round((sum.liveAt.at - sum.finalEnd) / 1000) : null) + ' s after the interruption ended');
    report(chunks.length > 3 && chunks[0].startMs > 14000 + droppedS * 1000 * 0.6, 'cap: catch-up starts at source ' + (chunks[0] && Math.round(chunks[0].startMs / 1000)) + ' s, after the ' + droppedS + ' s of oldest voiced audio that was dropped from ' + 14 + ' s');
    report(chunks.slice(1).every((c) => c.skippedVoiced <= 100 && c.cost < 6), 'cap: after the drop playback is continuous (loud source frames skipped between chunks: ' + chunks.slice(1).map((c) => c.skippedVoiced).join(',') + ')');
    report(chunks.at(-1) && chunks.at(-1).endMs > 420000, 'cap: playback reaches the end of the source at ' + (chunks.at(-1) && Math.round(chunks.at(-1).endMs / 1000)) + ' s');
  },

  async clip() {
    console.log('--- scenario clip');
    const clipSource = speech(10, 5);
    const browser = await chromium.launch(launchOptions(null));
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.addInitScript(captureInit);
      await page.goto('http://127.0.0.1:' + PORT + '/');
      const events = await page.evaluate(async (b64) => {
        const mod = await import('/deps/wireweave/src/modules/voice-thread.js');
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const sched = new mod.ThreadScheduler({ player: mod.createBlobPlayer(), ownTalkGraceMs: 0 });
        const log = [];
        const start = performance.now();
        for (const type of ['clip-started', 'clip-interrupted', 'clip-ended']) sched.addEventListener(type, (e) => log.push({ type, at: Math.round(performance.now() - start), offsetMs: Math.round(e.detail.offsetMs || 0) }));
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        sched.enqueue({ id: 'c1', speaker: 'speaker01', name: 'X', seq: 1, durationMs: 10000, mime: 'audio/wav', bytes });
        for (let waited = 0; waited < 15000 && !(sched.current && sched.current.handle.position() >= 4000); waited += 20) await sleep(20);
        sched.setLocalTalking(true);
        const queued = sched.snapshot().lanes[0].clips[0];
        log.push({ type: 'remainder-at-lane-head', at: Math.round(performance.now() - start), offsetMs: Math.round(queued.offsetMs), id: queued.id });
        await sleep(3000);
        sched.setLocalTalking(false);
        await sleep(7500);
        return log;
      }, wavBytes(clipSource).toString('base64'));
      for (const e of events) console.log('      ' + JSON.stringify(e));
      const dump = await fetchCapture(page);
      const segments = audibleSegments(decodeCapture(dump));
      const r = align(join(...segments.map((seg) => seg.samples)), toRate16k(clipSource, RATE));
      printHeard(segments, r, 0);
      const interrupted = events.find((e) => e.type === 'clip-interrupted');
      const remainder = events.find((e) => e.type === 'remainder-at-lane-head');
      const resumed = events.filter((e) => e.type === 'clip-started')[1];
      report(interrupted && Math.abs(interrupted.offsetMs - 4000) < 400, 'clip: interrupted at ' + (interrupted && interrupted.offsetMs) + ' ms of the 10 s clip');
      report(remainder && remainder.offsetMs === interrupted.offsetMs, 'clip: the remainder sits at the head of the lane at offset ' + (remainder && remainder.offsetMs) + ' ms');
      report(resumed && resumed.offsetMs === interrupted.offsetMs, 'clip: resumed at offset ' + (resumed && resumed.offsetMs) + ' ms');
      const total = segments.reduce((n, seg) => n + seg.parts.reduce((m, part) => m + part.length, 0), 0) / 16;
      report(Math.abs(total - 10000) < 800, 'clip: ' + Math.round(total) + ' ms of the 10 s clip were heard in total (' + segments.map((seg) => frameMs(seg.samples.length)).join(' + ') + ')');
      report(r.gapWindows.length === 0 && r.endMs - r.startMs > 8500, 'clip: heard in source order covering ' + Math.round((r.endMs - r.startMs) / 1000) + ' s of the clip with no gap window (' + r.gapWindows.join(',') + ')');
    } finally { await browser.close().catch(() => {}); }
  }
};

const wanted = process.argv.slice(2);
if (!wanted.includes('metric')) await startRig();
try {
  for (const name of wanted.length ? wanted : ['interrupt', 'clip', 'two']) await scenarios[name]();
} catch (e) { report(false, 'error: ' + e.message + '\n' + e.stack); }
stopRig();
console.log(failures.length ? 'THREAD_CATCHUP_FAIL ' + failures.length : 'THREAD_CATCHUP_OK');
process.exit(failures.length ? 1 : 0);
