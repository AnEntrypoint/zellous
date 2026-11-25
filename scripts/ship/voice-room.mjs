import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const wireweaveDir = process.env.WIREWEAVE_DIR || new URL('../../../wireweave', import.meta.url).pathname;
const { WebSocketServer } = await import(wireweaveDir + '/node_modules/ws/wrapper.mjs');
const { EphemeralRelay } = await import(wireweaveDir + '/src/ephemeral-relay.js');
const { generateSecretKey } = await import(wireweaveDir + '/node_modules/nostr-tools/lib/esm/pure.js');

const WORK = fs.mkdtempSync(path.join(process.env.OUT_DIR || os.tmpdir(), 'voice-room-'));
const PORT = Number(process.env.PORT || 5340);
const RELAY_PORT = Number(process.env.RELAY_PORT || 7640);
const RATE = 48000;
const TONES = [523, 659, 784, 988, 1175, 1397];
const REELECT_LIMIT_MS = Number(process.env.REELECT_LIMIT_MS || 15000);
const HEAR_LIMIT_MS = Number(process.env.HEAR_LIMIT_MS || 30000);
const SPEECH_DIR = process.env.SPEECH_DIR;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

const failures = [];
const report = (ok, label) => { console.log((ok ? 'ok    ' : 'FAIL  ') + label); if (!ok) failures.push(label); };

const toneWav = (hz) => {
  const samples = RATE * 4;
  const b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / RATE) * 0.3 * 32767), 44 + i * 2);
  return b;
};


const readWav = (file) => {
  const b = fs.readFileSync(file);
  const out = new Float32Array((b.length - 44) / 2);
  for (let i = 0; i < out.length; i++) out[i] = b.readInt16LE(44 + i * 2) / 32768;
  return out;
};
const wavFrom = (samples) => {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return b;
};
const speechMic = (leadSeconds, speechSeconds, offset) => {
  const files = fs.readdirSync(SPEECH_DIR).filter((f) => f.endsWith('.wav')).sort();
  const out = new Float32Array(Math.round((leadSeconds + speechSeconds) * RATE));
  let at = Math.round(leadSeconds * RATE);
  for (let k = 0; at < out.length; k++) {
    const clip = readWav(path.join(SPEECH_DIR, files[(offset + k) % files.length]));
    const take = Math.min(clip.length, out.length - at);
    out.set(clip.subarray(0, take), at);
    at += take + Math.round(0.7 * RATE);
  }
  return out;
};

const wsInit = (port) => {
  const W = window.WebSocket;
  window.WebSocket = function (u, p) { return new W('ws://127.0.0.1:' + port, p); };
  window.WebSocket.prototype = W.prototype;
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
};

const rawAudioInit = () => {
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = (constraints) => {
    if (constraints && constraints.audio) constraints = { ...constraints, audio: { ...(typeof constraints.audio === 'object' ? constraints.audio : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false } };
    return gum(constraints);
  };
};

const probeInit = () => {
  const taps = new WeakMap();
  let ctx = null;
  const tapOf = (el) => {
    ctx = ctx || new AudioContext({ sampleRate: 48000 });
    if (taps.has(el) && taps.get(el).stream === el.srcObject) return taps.get(el);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 16384;
    analyser.smoothingTimeConstant = 0;
    const source = ctx.createMediaStreamSource(el.srcObject);
    source.connect(analyser);
    const tap = { analyser, stream: el.srcObject, source };
    taps.set(el, tap);
    return tap;
  };
  window.__probe = async (ms) => {
    const els = [...document.querySelectorAll('audio[data-voice-peer]')].filter((el) => el.srcObject);
    const accum = els.map(() => ({ power: null, rms: 0, n: 0 }));
    const taps2 = els.map(tapOf);
    if (ctx.state !== 'running') await ctx.resume();
    const until = performance.now() + ms;
    while (performance.now() < until) {
      await new Promise((r) => setTimeout(r, 100));
      els.forEach((el, i) => {
        const a = taps2[i].analyser;
        const f = new Float32Array(a.frequencyBinCount);
        a.getFloatFrequencyData(f);
        const t = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(t);
        let s = 0; for (let k = 0; k < t.length; k++) s += t[k] * t[k];
        const acc = accum[i];
        if (!acc.power) acc.power = new Float64Array(f.length);
        for (let k = 0; k < f.length; k++) acc.power[k] += Math.pow(10, f[k] / 10);
        acc.rms += Math.sqrt(s / t.length);
        acc.n++;
      });
    }
    return els.map((el, i) => {
      const acc = accum[i];
      let best = 0;
      for (let k = 4; k < acc.power.length; k++) if (acc.power[k] > acc.power[best]) best = k;
      return { key: el.dataset.voicePeer, muted: !!el.muted, volume: el.volume, trackLive: el.srcObject.getAudioTracks().some((t) => t.readyState === 'live'), hz: Math.round(best * 48000 / 16384), rms: +(acc.rms / acc.n).toFixed(5) };
    });
  };
  window.__hubLog = [];
  const hookTimer = setInterval(() => {
    let session = null;
    try { session = window.lk.session(); } catch {}
    if (!session || session.__hubHooked) return;
    session.__hubHooked = true;
    if (!session.remoteKeys) session.remoteKeys = () => [...session.peers.keys()];
    clearInterval(hookTimer);
    for (const type of ['hub-changed', 'hub-lost']) session.addEventListener(type, (e) => window.__hubLog.push({ t: Math.round(performance.now()), type, hub: e.detail.hub && e.detail.hub.slice(0, 6), previous: e.detail.previous && e.detail.previous.slice(0, 6), silent: e.detail.silent, hb: e.detail.hbAgeMs, net: e.detail.netAgeMs }));
  }, 100);
  window.__upload = async (ms) => {
    const session = window.lk.session();
    const snap = async () => {
      let payload = 0, header = 0, transport = 0;
      for (const [, peer] of session.peers) {
        if (!peer.pc) continue;
        const stats = await peer.pc.getStats();
        stats.forEach((r) => {
          if (r.type === 'outbound-rtp') { payload += r.bytesSent || 0; header += r.headerBytesSent || 0; }
          if (r.type === 'candidate-pair' && (r.nominated || r.selected) && r.state === 'succeeded') transport += r.bytesSent || 0;
        });
      }
      return { payload, header, transport, peers: session.peers.size };
    };
    const a = await snap();
    await new Promise((r) => setTimeout(r, ms));
    const b = await snap();
    return { payload: b.payload - a.payload, header: b.header - a.header, transport: b.transport - a.transport, peersBefore: a.peers, peersAfter: b.peers };
  };
  window.__videoState = () => {
    const session = window.lk.session();
    const out = {};
    const vs = window.state.voiceVideos || {};
    for (const k of Object.keys(vs)) out[k] = vs[k].getVideoTracks().map((t) => ({ readyState: t.readyState, muted: t.muted }));
    const frames = {};
    for (const [pk, peer] of session.peers) { frames[pk.slice(0, 12)] = peer.pc ? peer.pc.getReceivers().filter((r) => r.track.kind === 'video').map((r) => r.track.readyState + (r.track.muted ? '/muted' : '/flowing')) : []; }
    return { videos: out, receivers: frames, participants: session.getParticipants().map((p) => ({ key: p.key, hasVideo: !!p.hasVideo })) };
  };
};

let relay = null;
let dev = null;

const startRig = async () => {
  relay = new EphemeralRelay({ WebSocketServer, port: RELAY_PORT });
  dev = spawn('node', ['scripts/dev-server.mjs'], { cwd: new URL('../..', import.meta.url).pathname, env: { ...process.env, ZELLOUS_LOCAL_DEPS: '1', PORT: String(PORT) }, stdio: 'ignore' });
  await wait(2500);
};
const stopRig = () => { try { dev?.kill(); } catch {} try { relay?.close?.(); } catch {} };

const chromeArgs = (mic, dir, port) => ['--headless=new', '--no-sandbox', '--remote-debugging-port=' + port, '--user-data-dir=' + dir, '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--auto-select-desktop-capture-source=Entire screen', '--enable-usermedia-screen-capturing', '--use-file-for-fake-audio-capture=' + mic, '--window-size=1440,900', 'about:blank'];
let cdpPort = Number(process.env.CDP_BASE || 9440);
const launchChrome = async (mic, tag) => {
  const port = cdpPort++;
  const dir = path.join(WORK, 'profile-' + tag);
  const child = spawn(process.env.CHROME_EXE || chromium.executablePath(), chromeArgs(mic, dir, port), { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) break; } catch {}
    await wait(200);
  }
  const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  return { browser, child };
};

let seq = 0;
const spawnPeer = async (tag, { mesh = false, speechOffset = null } = {}) => {
  const index = seq++;
  const hz = TONES[index % TONES.length];
  let mic = path.join(WORK, 'tone-' + hz + '.wav');
  if (speechOffset !== null) { mic = path.join(WORK, 'speech-' + tag + '.wav'); fs.writeFileSync(mic, wavFrom(speechMic(Number(process.env.THREAD_LEAD_S || 30), Number(process.env.THREAD_SPEECH_S || 24), speechOffset))); mic += '%noloop'; }
  else if (!fs.existsSync(mic)) fs.writeFileSync(mic, toneWav(hz));
  const { browser, child } = await launchChrome(mic, tag + '-' + index);
  const context = browser.contexts()[0];
  await context.grantPermissions(['microphone', 'camera']).catch(() => {});
  const page = context.pages()[0] || await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  page.on('pageerror', (e) => console.log('      pageerror ' + tag + ' ' + e.message));
  await page.addInitScript(wsInit, RELAY_PORT);
  await page.addInitScript(rawAudioInit);
  await page.addInitScript(probeInit);
  const key = hex(generateSecretKey());
  await page.addInitScript((k) => { try { if (!localStorage.getItem('zn_sk')) localStorage.setItem('zn_sk', k); } catch {} }, key);
  await page.goto('http://127.0.0.1:' + PORT + '/nostr-chat/?local=1&cb=' + Date.now());
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.waitForFunction(() => window.appReady === true, null, { timeout: 40000 });
      await page.getByText('Continue without a backup').click({ timeout: 1500 }).catch(() => {});
      await page.evaluate(() => { window.stateSignals.setupOpen.value = false; });
      break;
    } catch { await wait(1500); }
  }
  const pubkey = await page.evaluate(() => window.state.nostrPubkey);
  if (mesh) await page.evaluate(() => { const s = window.lk.session(); s._sfuShouldHaveConnectionTo = () => true; s._sfuElect = () => {}; s._sfuRelayAll = () => {}; });
  return { tag, hz, browser, context, page, pubkey, child, pid: child.pid, alive: true };
};

const makeServerWithVoice = async (first) => {
  const sid = await first.page.evaluate(async () => { await window.__zellous.servers.create('room-' + Date.now().toString(36)); return window.state.currentServerId; });
  await wait(3000);
  await first.page.evaluate(() => window.channelManager.showCreateModal(null, null));
  await wait(400);
  await first.page.selectOption('#ccType', 'voice');
  await first.page.fill('#ccName', 'voice-one');
  await first.page.locator('#ccSubmit').click();
  await wait(4000);
  return sid;
};

const joinServer = async (peer, sid) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await peer.page.waitForFunction(() => window.appReady === true, null, { timeout: 40000 });
      await peer.page.evaluate(async (s) => { await window.__zellous.servers.join(s, { name: 'room' }); }, sid);
      break;
    } catch (e) { console.log('      joinServer retry ' + peer.tag + ': ' + String(e.message).split('\n')[0]); await wait(2000); }
  }
  await wait(2500);
};

const joinVoice = async (peer) => {
  await peer.page.evaluate(() => { const a = [...document.querySelectorAll('.ca-rail-channels a')].find((x) => x.textContent.includes('voice-one')); a && a.click(); });
  await peer.page.waitForFunction(() => window.state.voiceConnected === true, null, { timeout: 20000 });
  await wait(2500);
  await peer.page.evaluate(() => window.lk.setMuted(false));
};

const stateOf = (peer) => peer.page.evaluate(() => {
  const s = window.lk.session();
  return { hub: s.sfu.hub, peers: [...s.peers.entries()].map(([k, p]) => [k, p.pc && p.pc.connectionState]), relayed: s.relayed ? [...s.relayed.keys()] : [], participants: s.getParticipants().filter((p) => !p.isLocal).length, muted: s.muted, deafened: s.deafened };
});

const diag = (peer) => peer.page.evaluate(async () => {
  const session = window.lk.session();
  const out = [];
  for (const [pk, p] of session.peers) {
    const stats = await p.pc.getStats();
    const rtp = [];
    stats.forEach((r) => { if (r.type === 'inbound-rtp' || r.type === 'outbound-rtp') rtp.push(r.type[0] + ':' + r.kind + ':' + (r.bytesReceived ?? r.bytesSent) + ':mid' + r.mid); });
    out.push({ pk: pk.slice(0, 6), conn: p.pc.connectionState, sig: p.pc.signalingState, tx: p.pc.getTransceivers().map((t) => t.mid + ':' + t.direction + '/' + t.currentDirection + ':s=' + (t.sender.track ? t.sender.track.readyState + (t.sender.track.enabled ? '+' : '-') : 'none') + ':r=' + t.receiver.track.readyState + (t.receiver.track.muted ? 'M' : '')), rtp });
  }
  return out;
});

const treePids = (root) => {
  const rows = spawnSync('ps', ['-eo', 'pid=,ppid=']).stdout.toString().trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
  const out = new Set([root]);
  let grew = true;
  while (grew) { grew = false; for (const [pid, ppid] of rows) if (out.has(ppid) && !out.has(pid)) { out.add(pid); grew = true; } }
  return [...out];
};
const signalTree = (root, signal) => { for (const pid of treePids(root)) { try { process.kill(pid, signal); } catch {} } };

const live = (peers) => peers.filter((p) => p.alive);

const failPeer = async (peer, kind) => {
  if (kind === 'close') { await peer.page.close(); }
  else if (kind === 'crash') { process.kill(peer.pid, 'SIGKILL'); }
  else if (kind === 'offline') { await peer.context.setOffline(true); if (process.env.OFFLINE_FREEZE !== '0') signalTree(peer.pid, 'SIGSTOP'); }
  peer.alive = false;
};

const busyMainThread = (peer, ms) => peer.page.evaluate((n) => { setTimeout(() => { const end = performance.now() + n; while (performance.now() < end); }, 0); }, ms);

const hubEvents = (peer) => peer.page.evaluate(() => window.__hubLog.map((e) => e.type + ':' + (e.hub || '')));
const name = (peers, pubkey) => (peers.find((p) => p.pubkey === pubkey) || { tag: pubkey ? pubkey.slice(0, 8) : 'none' }).tag;

const hearMatrix = async (peers, { ms = 1500, silent = new Set(), deaf = new Set() } = {}) => {
  const alive = live(peers);
  const results = await Promise.all(alive.map(async (l) => [l, await l.page.evaluate((t) => window.__probe(t), ms).catch(() => [])]));
  const rows = [];
  for (const [listener, els] of results) {
    for (const speaker of alive) {
      if (speaker === listener) continue;
      const mine = els.filter((e) => e.key === speaker.pubkey);
      const best = mine.sort((a, b) => b.rms - a.rms)[0] || null;
      const heard = !!best && !best.muted && best.volume > 0 && best.rms > 0.003 && Math.abs(best.hz - speaker.hz) <= 12;
      const wrong = els.filter((e) => e.key === speaker.pubkey && e.rms > 0.003 && Math.abs(e.hz - speaker.hz) > 12);
      const expectHeard = !silent.has(speaker.tag) && !deaf.has(listener.tag);
      rows.push({ listener: listener.tag, speaker: speaker.tag, expectHeard, heard, rms: best ? best.rms : 0, hz: best ? best.hz : 0, want: speaker.hz, muted: best ? best.muted : null, wrong: wrong.length, elements: mine.length });
    }
  }
  return rows;
};

const printMatrix = (rows) => { for (const r of rows) console.log('      ' + r.listener + ' <- ' + r.speaker + ' heard=' + r.heard + ' rms=' + r.rms + ' hz=' + r.hz + ' (tone ' + r.want + ') elMuted=' + r.muted + ' elements=' + r.elements); };

const matrixOk = (rows) => rows.every((r) => r.heard === r.expectHeard && r.wrong === 0 && r.elements <= 1);

const settle = async (peers, label, opts = {}) => {
  if (process.env.QUICK_FAIL) opts = { ...opts, limit: Number(process.env.QUICK_FAIL) };
  const t0 = Date.now();
  let rows = [];
  while (Date.now() - t0 < (opts.limit || HEAR_LIMIT_MS)) {
    rows = await hearMatrix(peers, { ms: 1200, ...opts });
    if (matrixOk(rows)) { const ms = Date.now() - t0; return { ok: true, ms, rows }; }
  }
  printMatrix(rows);
  for (const [p, st] of await hubOf(peers)) console.log('      state ' + p.tag + ' ' + JSON.stringify({ hub: name(peers, st.hub), peers: st.peers.map(([k, c]) => name(peers, k) + ':' + c), relayed: st.relayed.map((k) => name(peers, k)), participants: st.participants }));
  if (process.env.DIAG) for (const p of live(peers)) console.log('      diag ' + p.tag + ' ' + JSON.stringify(await diag(p)));
  return { ok: false, ms: Date.now() - t0, rows };
};

const bootRoom = async (count, { mesh = false } = {}) => {
  const peers = [];
  for (let i = 0; i < count; i++) peers.push(await spawnPeer('P' + (i + 1), { mesh }));
  const sid = await makeServerWithVoice(peers[0]);
  for (const p of peers.slice(1)) await joinServer(p, sid);
  for (const p of peers) { await p.page.evaluate(() => window.channelManager && 0); await joinVoice(p); await wait(1500); }
  return { peers, sid };
};

const closeAll = async (peers) => { for (const p of peers) { signalTree(p.pid, 'SIGCONT'); await p.browser.close().catch(() => {}); try { p.child.kill('SIGKILL'); } catch {} } };

const hubOf = async (peers) => {
  const states = await Promise.all(live(peers).map(async (p) => [p, await stateOf(p)]));
  return states;
};

const waitHubAgreement = async (peers, { not = null, limit = 30000 } = {}) => {
  const t0 = Date.now();
  while (Date.now() - t0 < limit) {
    const states = await hubOf(peers);
    const hubs = new Set(states.map(([p, s]) => (s.hub === null ? '__null' : s.hub)));
    if (hubs.size === 1) { const h = [...hubs][0]; if (h !== '__null' && h !== not) return { hub: h, ms: Date.now() - t0 }; }
    await wait(300);
  }
  return null;
};

const scenarios = {
  async room3() {
    console.log('--- room3: plain voice room, three peers');
    const { peers } = await bootRoom(3);
    try {
      const agree = await waitHubAgreement(peers);
      report(!!agree, 'room3: all three peers name the same hub ' + (agree ? name(peers, agree.hub) + ' after ' + agree.ms + ' ms' : '(no agreement)'));
      const s0 = await settle(peers, 'start');
      printMatrix(s0.rows);
      report(s0.ok, 'room3: every listener hears every other peer, each with its own tone, no swap, in ' + s0.ms + ' ms');

      const [a, b, c] = peers;
      await a.page.evaluate(() => window.lk.setMuted(true));
      const m = await settle(peers, 'mute', { silent: new Set([a.tag]) });
      printMatrix(m.rows.filter((r) => r.speaker === a.tag));
      report(m.ok, 'room3: ' + a.tag + ' muted is inaudible to both others while ' + b.tag + ' and ' + c.tag + ' stay audible');
      await a.page.evaluate(() => window.lk.setMuted(false));
      const um = await settle(peers, 'unmute');
      report(um.ok, 'room3: unmuted again, audible to all');

      await b.page.evaluate(() => window.lk.toggleDeafen());
      const d = await settle(peers, 'deafen', { deaf: new Set([b.tag]) });
      printMatrix(d.rows.filter((r) => r.listener === b.tag));
      report(d.ok, 'room3: ' + b.tag + ' deafened hears nothing, the others still hear each other and ' + b.tag);
      await b.page.evaluate(() => window.lk.toggleDeafen());
      const ud = await settle(peers, 'undeafen');
      report(ud.ok, 'room3: undeafened, hears all again');

      const hubTag = name(peers, agree && agree.hub);
      const hubPeer = peers.find((p) => p.tag === hubTag);
      const nonHub = peers.find((p) => p !== hubPeer);

      await nonHub.page.evaluate(() => window.lk.disconnect());
      await wait(2000);
      nonHub.alive = false;
      const gone = await settle(peers, 'nonhub-left');
      report(gone.ok, 'room3: non-hub ' + nonHub.tag + ' left, remaining two hear each other');
      await joinVoice(nonHub);
      nonHub.alive = true;
      const back = await settle(peers, 'nonhub-rejoined');
      printMatrix(back.rows);
      report(back.ok, 'room3: ' + nonHub.tag + ' rejoined, all three hear each other (' + back.ms + ' ms)');

      const hub2 = await waitHubAgreement(peers);
      const hubNow = peers.find((p) => hub2 && p.pubkey === hub2.hub);
      await hubNow.page.evaluate(() => window.lk.disconnect());
      hubNow.alive = false;
      const t0 = Date.now();
      const re = await waitHubAgreement(peers, { not: hubNow.pubkey, limit: REELECT_LIMIT_MS });
      report(!!re, 'room3: hub ' + hubNow.tag + ' left, the others agree on a new hub ' + (re ? name(peers, re.hub) + ' within ' + (Date.now() - t0) + ' ms' : 'not within ' + REELECT_LIMIT_MS + ' ms'));
      const afterHub = await settle(peers, 'hub-left');
      printMatrix(afterHub.rows);
      report(afterHub.ok, 'room3: with the hub gone the remaining two hear each other (' + afterHub.ms + ' ms)');
      await joinVoice(hubNow);
      hubNow.alive = true;
      const hubBack = await settle(peers, 'hub-rejoined');
      printMatrix(hubBack.rows);
      report(hubBack.ok, 'room3: old hub rejoined, all three hear each other (' + hubBack.ms + ' ms)');
    } finally { await closeAll(peers); }
  },

  async video3() {
    console.log('--- video3: camera and screen share through the hub, three peers');
    const { peers } = await bootRoom(3);
    try {
      await waitHubAgreement(peers);
      const [a, b, c] = peers;
      const videoSeen = async (watchers, sourcePeer, limit = 20000) => {
        const t0 = Date.now();
        const key = 'nostr-' + sourcePeer.pubkey.slice(0, 12);
        while (Date.now() - t0 < limit) {
          const ok = await Promise.all(watchers.map((w) => w.page.evaluate((k) => { const v = (window.state.voiceVideos || {})[k]; return !!v && v.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted); }, key).catch(() => false)));
          if (ok.every(Boolean)) return Date.now() - t0;
          await wait(500);
        }
        return null;
      };
      const frameCheck = async (w, sourcePeer) => {
        const key = 'nostr-' + sourcePeer.pubkey.slice(0, 12);
        return w.page.evaluate(async (k) => {
          const stream = (window.state.voiceVideos || {})[k];
          if (!stream) return null;
          const v = document.createElement('video'); v.muted = true; v.srcObject = stream; v.playsInline = true;
          document.body.appendChild(v); await v.play().catch(() => {});
          await new Promise((r) => setTimeout(r, 1500));
          const out = { w: v.videoWidth, h: v.videoHeight, t: v.currentTime };
          v.remove();
          return out;
        }, key);
      };
      await a.page.evaluate(() => window.lk.setCamera(true));
      const camMs = await videoSeen([b, c], a);
      report(camMs !== null, 'video3: camera of ' + a.tag + ' reaches ' + b.tag + ' and ' + c.tag + (camMs !== null ? ' in ' + camMs + ' ms' : ' (never)'));
      for (const w of [b, c]) { const f = await frameCheck(w, a); report(!!f && f.w > 0 && f.t > 0, 'video3: ' + w.tag + ' decodes camera frames from ' + a.tag + ' ' + JSON.stringify(f)); }
      await a.page.evaluate(() => window.lk.setCamera(false));
      await wait(2500);
      const hubKey = (await stateOf(a)).hub;
      const sharer = peers.find((p) => p.pubkey !== hubKey && p !== a) || b;
      await sharer.page.evaluate(() => window.lk.setScreen(true));
      const others = peers.filter((p) => p !== sharer);
      const scrMs = await videoSeen(others, sharer);
      report(scrMs !== null, 'video3: screen share of ' + sharer.tag + ' reaches ' + others.map((o) => o.tag).join(' and ') + (scrMs !== null ? ' in ' + scrMs + ' ms' : ' (never)'));
      for (const w of others) { const f = await frameCheck(w, sharer); report(!!f && f.w > 0 && f.t > 0, 'video3: ' + w.tag + ' decodes screen frames from ' + sharer.tag + ' ' + JSON.stringify(f)); }
      const au = await settle(peers, 'audio-with-video');
      report(au.ok, 'video3: audio between all three unchanged while the screen is shared');
      await sharer.page.evaluate(() => window.lk.setScreen(false));
      await wait(2500);
      const states = await Promise.all(peers.map((p) => p.page.evaluate(() => window.__videoState())));
      console.log('      after stop ' + JSON.stringify(states.map((s) => s.participants.map((p) => p.hasVideo))));
      report(states.every((s) => s.participants.every((p) => !p.hasVideo)), 'video3: after stopping, no participant is marked as sharing video');
    } finally { await closeAll(peers); }
  },

  async failover(kind, count) {
    console.log('--- failover-' + kind + '-' + count);
    const { peers, sid } = await bootRoom(count);
    try {
      const agree = await waitHubAgreement(peers);
      report(!!agree, kind + count + ': ' + count + ' peers agree on hub ' + (agree ? name(peers, agree.hub) : '(none)'));
      const first = await settle(peers, 'before');
      report(first.ok, kind + count + ': everyone hears everyone before the failure');
      const hubPeer = peers.find((p) => agree && p.pubkey === agree.hub);
      console.log('      hub is ' + hubPeer.tag + ' pid ' + hubPeer.pid);
      const t0 = Date.now();
      if (kind === 'close') { await hubPeer.page.close(); }
      else if (kind === 'crash') { process.kill(hubPeer.pid, 'SIGKILL'); }
      else if (kind === 'offline') { await hubPeer.context.setOffline(true); if (process.env.OFFLINE_FREEZE !== '0') signalTree(hubPeer.pid, 'SIGSTOP'); }
      hubPeer.alive = false;
      const re = await waitHubAgreement(peers, { not: hubPeer.pubkey, limit: REELECT_LIMIT_MS });
      const reMs = Date.now() - t0;
      report(!!re, kind + count + ': the remaining ' + (count - 1) + ' peers agree on a new hub ' + (re ? name(peers, re.hub) : '') + ' after ' + reMs + ' ms (limit ' + REELECT_LIMIT_MS + ' ms)');
      if (process.env.HUBLOG) for (const p of live(peers)) console.log('      hublog ' + p.tag + ' ' + p.pubkey.slice(0, 6) + ' ' + JSON.stringify(await p.page.evaluate(() => window.__hubLog)));
      const after = await settle(peers, 'after');
      printMatrix(after.rows);
      const hearMs = Date.now() - t0;
      report(after.ok, kind + count + ': every remaining peer hears every other remaining peer, ' + hearMs + ' ms after the failure');
      const newest = await spawnPeer('L' + (count + 1));
      await joinServer(newest, sid);
      await joinVoice(newest);
      peers.push(newest);
      const late = await settle(peers, 'late');
      printMatrix(late.rows);
      report(late.ok, kind + count + ': a late joiner hears all remaining peers and is heard by all (' + late.ms + ' ms)');
      if (kind === 'offline') signalTree(hubPeer.pid, 'SIGCONT');
      console.log('RECOVERY kind=' + kind + ' peers=' + count + ' hog=' + (process.env.HOG || 'none') + ' agree_ms=' + reMs + ' hear_ms=' + hearMs + ' late_ms=' + late.ms);
    } finally { await closeAll(peers.filter((p) => true)); }
  },

  async failover2(kind, count) {
    console.log('--- failover2-' + kind + '-' + count);
    const { peers, sid } = await bootRoom(count);
    const errors = [];
    peers.forEach((p) => p.page.on('pageerror', (e) => errors.push(p.tag + ' ' + e.message)));
    try {
      const agree = await waitHubAgreement(peers);
      report(!!agree, 'f2-' + kind + count + ': ' + count + ' peers agree on hub ' + (agree ? name(peers, agree.hub) : '(none)'));
      const first = await settle(peers, 'before');
      report(first.ok, 'f2-' + kind + count + ': everyone hears everyone before the failure');
      const hub1 = peers.find((p) => agree && p.pubkey === agree.hub);
      const t1 = Date.now();
      await failPeer(hub1, kind);
      const re1 = await waitHubAgreement(peers, { not: hub1.pubkey, limit: REELECT_LIMIT_MS });
      const re1Ms = Date.now() - t1;
      report(!!re1, 'f2-' + kind + count + ': first failure, ' + (count - 1) + ' peers agree on hub ' + (re1 ? name(peers, re1.hub) : '') + ' after ' + re1Ms + ' ms');
      const hub2 = peers.find((p) => re1 && p.pubkey === re1.hub);
      const t2 = Date.now();
      await failPeer(hub2, kind);
      const remaining = live(peers);
      const re2 = await waitHubAgreement(peers, { not: hub2.pubkey, limit: REELECT_LIMIT_MS });
      const re2Ms = Date.now() - t2;
      report(!!re2, 'f2-' + kind + count + ': second failure right after, ' + remaining.length + ' remaining agree on hub ' + (re2 ? name(peers, re2.hub) : '') + ' after ' + re2Ms + ' ms');
      const after = await settle(peers, 'after2');
      printMatrix(after.rows);
      const hear2Ms = Date.now() - t2;
      report(after.ok, 'f2-' + kind + count + ': every remaining peer hears every other, ' + hear2Ms + ' ms after the second failure');
      if (remaining.length === 1) {
        const st = await stateOf(remaining[0]);
        const voice = await remaining[0].page.evaluate(() => ({ connected: window.state.voiceConnected, participants: window.lk.session().getParticipants().length }));
        console.log('      lone peer state ' + JSON.stringify({ hub: name(peers, st.hub), peers: st.peers.length, voice }));
        report(st.hub === remaining[0].pubkey && voice.connected === true, 'f2-' + kind + count + ': the lone peer stays connected to voice and is its own hub');
      }
      const newest = await spawnPeer('L' + (count + 1));
      newest.page.on('pageerror', (e) => errors.push(newest.tag + ' ' + e.message));
      await joinServer(newest, sid);
      await joinVoice(newest);
      peers.push(newest);
      const late = await settle(peers, 'late');
      printMatrix(late.rows);
      report(late.ok, 'f2-' + kind + count + ': a late joiner hears all remaining peers and is heard by all (' + late.ms + ' ms)');
      report(errors.length === 0, 'f2-' + kind + count + ': no page error (' + errors.length + ')');
      for (const hp of [hub1, hub2]) if (kind === 'offline') signalTree(hp.pid, 'SIGCONT');
      console.log('RECOVERY kind=' + kind + ' peers=' + count + ' hog=' + (process.env.HOG || 'none') + ' first_agree_ms=' + re1Ms + ' second_agree_ms=' + re2Ms + ' second_hear_ms=' + hear2Ms + ' late_ms=' + late.ms);
    } finally { await closeAll(peers); }
  },

  async busy(who, count) {
    console.log('--- busy-' + who + '-' + count);
    const { peers } = await bootRoom(count);
    try {
      const agree = await waitHubAgreement(peers);
      report(!!agree, 'busy-' + who + count + ': ' + count + ' peers agree on hub ' + (agree ? name(peers, agree.hub) : '(none)'));
      const first = await settle(peers, 'before');
      report(first.ok, 'busy-' + who + count + ': everyone hears everyone before');
      const hubPeer = peers.find((p) => agree && p.pubkey === agree.hub);
      const target = who === 'hub' ? hubPeer : peers.find((p) => p !== hubPeer);
      const ms = Number(process.env.BUSY_MS || 9000);
      const before = await Promise.all(peers.map(hubEvents));
      await busyMainThread(target, ms);
      await wait(ms + 6000);
      const afterEv = await Promise.all(peers.map(hubEvents));
      const changed = peers.filter((p, i) => JSON.stringify(before[i]) !== JSON.stringify(afterEv[i])).map((p) => p.tag);
      const hubsNow = await hubOf(peers);
      const same = new Set(hubsNow.map(([, s]) => s.hub));
      report(changed.length === 0 && same.size === 1 && [...same][0] === agree.hub, 'busy-' + who + count + ': main thread of ' + target.tag + (target === hubPeer ? ' (the hub)' : '') + ' blocked ' + ms + ' ms, no hub change or loss on any peer (events changed on: ' + (changed.join(',') || 'none') + ')');
      const after = await settle(peers, 'after');
      report(after.ok, 'busy-' + who + count + ': everyone still hears everyone (' + after.ms + ' ms)');
    } finally { await closeAll(peers); }
  },

  async start(kind, count) {
    const { peers } = await bootRoom(Number(count || kind || 3));
    try {
      const r = await settle(peers, 'start');
      printMatrix(r.rows);
      if (process.env.DUMP_EL) for (const p of peers) console.log('      els ' + p.tag + ' ' + JSON.stringify(await p.page.evaluate(() => [...document.querySelectorAll('audio')].map((el) => ({ peer: el.dataset.voicePeer && el.dataset.voicePeer.slice(0, 6), cls: el.className, paused: el.paused, sid: el.srcObject && el.srcObject.id.slice(0, 6), tracks: el.srcObject && el.srcObject.getTracks().map((t) => t.id.slice(0, 6) + t.readyState), parent: el.parentElement && el.parentElement.tagName })))));
      report(r.ok, 'start' + peers.length + ': every listener hears every other peer with its own tone (' + r.ms + ' ms)');
    } finally { await closeAll(peers); }
  },

  async failoverThread(kind) {
    console.log('--- failover-thread-' + kind);
    if (!SPEECH_DIR) { report(false, 'failover-thread: SPEECH_DIR must name a directory of 48 kHz mono 16-bit wav speech clips'); return; }
    const peers = [];
    for (let i = 0; i < 3; i++) peers.push(await spawnPeer('P' + (i + 1), { speechOffset: i * 7 }));
    try {
      const sid = await peers[0].page.evaluate(async () => { await window.__zellous.servers.create('thread-' + Date.now().toString(36)); return window.state.currentServerId; });
      await wait(3000);
      for (const p of peers.slice(1)) await joinServer(p, sid);
      await peers[0].page.evaluate(() => window.channelManager.showCreateModal(null, null));
      await wait(400);
      await peers[0].page.selectOption('#ccType', 'voice-thread');
      await peers[0].page.fill('#ccName', 'thread-one');
      await peers[0].page.locator('#ccSubmit').click();
      await wait(4000);
      for (const p of peers) { await p.page.evaluate(() => { const a = [...document.querySelectorAll('.ca-rail-channels a')].find((x) => x.textContent.includes('thread-one')); a && a.click(); }); await wait(1200); }
      for (const p of peers) await p.page.getByText('Continue without a backup').click({ timeout: 2500 }).catch(() => {});
      const t0 = Date.now();
      await Promise.all(peers.map((p) => p.page.locator('.ds-g3-vtbar .ds-g3-evb', { hasText: 'Join thread' }).click()));
      const agree = await waitHubAgreement(peers);
      report(!!agree, 'thread-' + kind + ': three peers in the thread agree on hub ' + (agree ? name(peers, agree.hub) : '(none)'));
      const hubPeer = peers.find((p) => agree && p.pubkey === agree.hub);
      const survivors = peers.filter((p) => p !== hubPeer);
      const [R, S] = survivors;
      const shorts = {};
      for (const p of peers) shorts[p.tag] = await p.page.evaluate(() => window.auth.npubShort());
      const lanesOf = (p) => p.page.evaluate(() => [...document.querySelectorAll('.ds-g3-vtlane')].map((l) => ({ name: (l.querySelector('.ds-g3-vtname') || {}).textContent, lag: (l.querySelector('.ds-g3-vtlag') || {}).textContent || '' })));
      const lagS = (text) => { const m = /(?:(\d+):)?([\d.]+)\s*s?\s*behind/.exec(text || ''); return m ? (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]) : 0; };
      const lagOf = (lanes, tag) => { const l = lanes.find((x) => x.name === shorts[tag]); return l ? lagS(l.lag) : 0; };
      console.log('      hub ' + hubPeer.tag + ' ' + shorts[hubPeer.tag] + ', listener R=' + R.tag + ', other survivor S=' + S.tag);
      const lead = Number(process.env.THREAD_LEAD_S || 30);
      const speechS = Number(process.env.THREAD_SPEECH_S || 24);
      const sample = async () => R.page.evaluate(() => { const own = document.querySelector('.ds-g3-vtstate'); return { own: !!own && own.classList.contains('own'), lanes: [...document.querySelectorAll('.ds-g3-vtlane')].map((l) => ({ name: (l.querySelector('.ds-g3-vtname') || {}).textContent, lag: (l.querySelector('.ds-g3-vtlag') || {}).textContent || '' })) }; });
      const killAt = t0 + (lead + 11) * 1000;
      let last = null;
      while (Date.now() < killAt) { await wait(500); last = await sample(); }
      const hubLagBefore = lagOf(last.lanes, hubPeer.tag);
      const sLagBefore = lagOf(last.lanes, S.tag);
      console.log('      at the failure: R own talk ' + last.own + ', lag of the hub lane ' + hubLagBefore + ' s, lag of ' + S.tag + ' lane ' + sLagBefore + ' s');
      if (kind === 'close') await hubPeer.page.close();
      else if (kind === 'crash') process.kill(hubPeer.pid, 'SIGKILL');
      else if (kind === 'offline') { await hubPeer.context.setOffline(true); signalTree(hubPeer.pid, 'SIGSTOP'); }
      if (kind !== 'none') hubPeer.alive = false;
      const tKill = Date.now();
      const re = kind === 'none' ? { hub: hubPeer.pubkey } : await waitHubAgreement(peers, { not: hubPeer.pubkey, limit: REELECT_LIMIT_MS });
      report(!!re, 'thread-' + kind + ': survivors agree on hub ' + (re ? name(peers, re.hub) : '(none)') + ' ' + (Date.now() - tKill) + ' ms after the failure');
      const speechEnd = t0 + (lead + speechS) * 1000;
      let hubLagMinWhileTalking = Infinity, sLagPeak = 0, hubLagPeak = 0;
      const trace = [];
      while (Date.now() < speechEnd + 2000) {
        await wait(500);
        const cur = await sample();
        const hubLag = lagOf(cur.lanes, hubPeer.tag);
        hubLagPeak = Math.max(hubLagPeak, hubLag);
        sLagPeak = Math.max(sLagPeak, lagOf(cur.lanes, S.tag));
        if (cur.own && Date.now() < speechEnd - 1500) hubLagMinWhileTalking = Math.min(hubLagMinWhileTalking, hubLag);
        trace.push(Math.round((Date.now() - tKill) / 1000) + 's own=' + cur.own + ' hub=' + hubLag + ' ' + S.tag + '=' + lagOf(cur.lanes, S.tag));
      }
      console.log('      trace ' + trace.filter((_, i) => i % 4 === 0).join(' | '));
      console.log('      while R was talking after the failure: hub lane lag min ' + hubLagMinWhileTalking + ' s, peak ' + hubLagPeak + ' s; ' + S.tag + ' lane lag peak ' + sLagPeak + ' s');
      report(last.own && hubLagBefore > 3, 'thread-' + kind + ': the hub lane held ' + hubLagBefore + ' s of queued audio while ' + R.tag + ' was talking when the hub died');
      report(hubLagMinWhileTalking >= hubLagBefore - 0.5, 'thread-' + kind + ': the dead hub lane keeps its queued audio across the failure (min after ' + hubLagMinWhileTalking + ' s, before ' + hubLagBefore + ' s)');
      report(sLagPeak > sLagBefore + 2, 'thread-' + kind + ': ' + S.tag + ' audio keeps arriving through the new hub (lane lag ' + sLagBefore + ' s -> peak ' + sLagPeak + ' s)');
      const stoppedAt = Date.now();
      let hubPlayedMs = null;
      let tick = 0;
      while (Date.now() - stoppedAt < 60000 && hubPlayedMs === null) {
        await wait(1000);
        const cur = await sample();
        if (++tick % 8 === 0) console.log('      after stop ' + Math.round((Date.now() - stoppedAt) / 1000) + 's own=' + cur.own + ' ' + JSON.stringify(cur.lanes.map((l) => l.name.slice(0, 8) + ':' + l.lag)));
        const hubLane = cur.lanes.find((l) => l.name === shorts[hubPeer.tag]);
        if (!cur.own && hubLane && /catching/.test(hubLane.lag)) hubPlayedMs = Date.now() - stoppedAt;
      }
      report(hubPlayedMs !== null, 'thread-' + kind + ': after ' + R.tag + ' stops talking the queued audio of the hub lane is played (lane shows catching up after ' + hubPlayedMs + ' ms)');
      if (kind === 'offline') signalTree(hubPeer.pid, 'SIGCONT');
    } finally { await closeAll(peers); }
  },

  async scale() {
    const counts = (process.env.SCALE_COUNTS || '2,3,4,5').split(',').map(Number);
    const mode = process.env.SCALE_MODE || 'hub';
    const seconds = Number(process.env.SCALE_SECONDS || 20);
    console.log('--- scale ' + mode + ' counts ' + counts.join(','));
    for (const n of counts) {
      const { peers } = await bootRoom(n, { mesh: mode === 'mesh' });
      try {
        if (mode !== 'mesh') await waitHubAgreement(peers);
        await settle(peers, 'warm', { limit: 40000 });
        const talkers = Number(process.env.SCALE_TALKERS || n);
        const talking = new Set(peers.slice(1, 1 + talkers));
        if (talkers >= n) peers.forEach((p) => talking.add(p));
        for (const p of peers.filter((x) => !talking.has(x))) await p.page.evaluate(() => window.lk.setMuted(true));
        await wait(3000);
        const results = await Promise.all(peers.map((p) => p.page.evaluate((ms) => window.__upload(ms), seconds * 1000)));
        const hubKey = mode === 'mesh' ? null : (await stateOf(peers[0])).hub;
        results.forEach((r, i) => {
          const kbps = (v) => Math.round((v * 8) / seconds / 100) / 10;
          console.log('UPLOAD mode=' + mode + ' talkers=' + talkers + ' peers=' + n + ' peer=' + peers[i].tag + (peers[i].pubkey === hubKey ? '(hub)' : '') + ' connections=' + r.peersBefore + '/' + r.peersAfter + ' rtp_payload_kbps=' + kbps(r.payload) + ' rtp_payload_plus_header_kbps=' + kbps(r.payload + r.header) + ' transport_kbps=' + kbps(r.transport));
        });
        const silent = new Set(peers.filter((x) => !talking.has(x)).map((p) => p.tag));
        if (process.env.HUBLOG) for (const p of peers) console.log('      hublog ' + p.tag + ' ' + p.pubkey.slice(0, 6) + ' ' + JSON.stringify(await p.page.evaluate(() => window.__hubLog)));
        const aud = await settle(peers, 'end', { limit: 8000, silent });
        report(aud.ok, 'scale ' + mode + ' ' + n + ': ' + talkers + ' talking, everyone hears every talker during the measurement');
      } finally { await closeAll(peers); }
    }
  }
};

const wanted = process.argv.slice(2);
if (!wanted.length) { console.log('usage: node scripts/ship/voice-room.mjs room3 video3 failover:<close|crash|offline>:<3|4> scale'); process.exit(1); }
await startRig();
try {
  for (const w of wanted) {
    const [name2, kind, count] = w.split(':');
    if (name2 === 'failover2') await scenarios.failover2(kind, Number(count || 3));
    else if (name2 === 'busy') await scenarios.busy(kind, Number(count || 3));
    else if (name2 === 'failover') await scenarios.failover(kind, Number(count || 3));
    else if (name2 === 'start') await scenarios.start(kind, count);
    else if (name2 === 'failover-thread') await scenarios.failoverThread(kind);
    else await scenarios[name2]();
  }
} catch (e) { report(false, 'error: ' + e.message + '\n' + e.stack); }
stopRig();
console.log(failures.length ? 'VOICE_ROOM_FAIL ' + failures.length : 'VOICE_ROOM_OK');
process.exit(failures.length ? 1 : 0);
