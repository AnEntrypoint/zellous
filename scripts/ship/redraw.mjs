import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const root = new URL('../..', import.meta.url).pathname;
const wireweaveDir = process.env.WIREWEAVE_DIR || new URL('../../../wireweave', import.meta.url).pathname;
const { WebSocketServer } = await import(wireweaveDir + '/node_modules/ws/wrapper.mjs');
const { EphemeralRelay } = await import(wireweaveDir + '/src/ephemeral-relay.js');

const WINDOW_MS = Number(process.env.REDRAW_WINDOW_MS || 8000);
const CLICKS = Number(process.env.REDRAW_CLICKS || 200);
const IDLE_BUDGET = Number(process.env.REDRAW_IDLE_BUDGET || 1);
const LIVE_BUDGET = Number(process.env.REDRAW_LIVE_BUDGET || 8);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

const SURFACES = {
  rail: 'aside.ca-rail',
  channels: 'aside.ca-rail .chans',
  voicebar: '.ds-g3-vbar',
  userpanel: '.ds-g3-me',
  members: '.ds-g3-mem',
  messages: '#app-main .ds-g3-msg',
  main: '#app-main',
  composer: '.ds-g3-comp',
  settings: '.ds-g3-set',
  picker: '.ds-g3-cpick',
};
const SIDEBAR = ['rail', 'channels', 'voicebar', 'userpanel', 'settings', 'picker'];

const micWav = () => {
  const rate = 48000, seconds = 12, n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const f0 = 130 + 30 * Math.sin(2 * Math.PI * 0.7 * t);
    let s = 0;
    for (let k = 1; k <= 8; k++) s += Math.sin(2 * Math.PI * f0 * k * t) / k;
    const flap = process.env.REDRAW_MIC === 'flap';
    const env = flap ? 0.5 + 0.5 * Math.sin(2 * Math.PI * 3.2 * t) : 1;
    const gate = flap ? (Math.sin(2 * Math.PI * 0.4 * t) > -0.6 ? 1 : 0.02) : 1;
    buf.writeInt16LE(Math.round(s * env * gate * 9000), 44 + i * 2);
  }
  const path = join(tmpdir(), 'zellous-redraw-mic.wav');
  writeFileSync(path, buf);
  return path;
};

const probeInstall = async (surfaces) => {
  const { SIGNALS } = await import(new URL('../js/adapter/signals.js', location.href).href);
  const renders = { count: 0, by: {} };
  for (const n of SIGNALS) if (window.stateSignals[n]) { let first = true; window.__effect(() => { void window.stateSignals[n].value; if (first) { first = false; return; } renders.by[n] = (renders.by[n] || 0) + 1; }); }
  window.__rpBy = renders.by;
  window.__effect(() => { for (const n of SIGNALS) { if (window.stateSignals[n]) void window.stateSignals[n].value; } renders.count++; });
  const names = Object.keys(surfaces);
  const tag = (el, name) => { (el.__surf || (el.__surf = new Set())).add(name); };
  const state = { stats: {}, original: new Map(), observer: null, started: 0 };
  const surfacesOf = (node) => {
    const found = new Set();
    for (let n = node; n; n = n.parentNode) {
      if (n.__surf) n.__surf.forEach((x) => found.add(x));
      if (n.nodeType === 1) for (const name of names) if (name !== 'messages' && !found.has(name) && n.matches(surfaces[name])) found.add(name);
    }
    return found;
  };
  window.__rp = {
    samples: [],
    start() {
      state.stats = Object.fromEntries(names.map((n) => [n, { mutations: 0, removed: 0, added: 0, attrs: 0, text: 0, children: 0 }]));
      state.original = new Map();
      for (const name of names) {
        const roots = [...document.querySelectorAll(surfaces[name])].map((r) => name === 'messages' ? r.parentElement : r).filter((r, i, a) => r && a.indexOf(r) === i);
        const all = [];
        for (const r of roots) { tag(r, name); all.push(r); r.querySelectorAll('*').forEach((e) => { tag(e, name); all.push(e); }); }
        state.original.set(name, all);
      }
      state.observer = new MutationObserver((records) => {
        for (const r of records) {
          for (const name of surfacesOf(r.target)) {
            const s = state.stats[name];
            s.mutations++;
            if (r.type === 'attributes') s.attrs++;
            else if (r.type === 'characterData') s.text++;
            else { s.children++; if (name === 'rail' && window.__rp.samples.length < 40) for (const x of r.removedNodes) if (x.nodeType === 1) window.__rp.samples.push(x.tagName + '.' + String(x.className).slice(0, 40) + ' in ' + (r.target.tagName + '.' + String(r.target.className).slice(0, 40)) + ' key=' + (x.getAttribute('key') || x.id || x.textContent.slice(0, 20))); s.removed += [...r.removedNodes].filter((x) => x.nodeType === 1).length; s.added += [...r.addedNodes].filter((x) => x.nodeType === 1).length; }
          }
        }
      });
      state.observer.observe(document.getElementById('app'), { subtree: true, childList: true, attributes: true, characterData: true });
      state.started = performance.now();
      renders.count = 0; for (const k of Object.keys(renders.by)) delete renders.by[k];
    },
    stop() {
      state.observer.takeRecords().length;
      state.observer.disconnect();
      const secs = (performance.now() - state.started) / 1000;
      const out = { __renders: +(renders.count / secs).toFixed(1) };
      for (const name of names) {
        const s = state.stats[name];
        const originals = state.original.get(name) || [];
        out[name] = { nodes: originals.length, mutPerSec: +(s.mutations / secs).toFixed(2), removed: s.removed, added: s.added, attrs: s.attrs, text: s.text, replaced: originals.filter((e) => !e.isConnected).length };
      }
      return out;
    },
  };
  window.__ct = { item: null, hit: null, active: false };
  window.addEventListener('click', (e) => { if (!window.__ct.active) return; window.__ct.hit = e.target; e.stopImmediatePropagation(); }, true);
};

const clickTarget = (page, i) => page.evaluate((i) => {
  const sel = 'aside.ca-rail a, aside.ca-rail button, aside.ca-rail [role=button], aside.ca-rail [role=link], .ca-rail-server, .ds-g3-mebtn';
  const items = [...document.querySelectorAll(sel)].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 4 && b.height > 4 && b.bottom > 0 && b.top < innerHeight && !e.closest('[inert]'); });
  const el = items[i % items.length];
  if (!el) return null;
  window.__ct.item = el; window.__ct.hit = null;
  const b = el.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, count: items.length };
}, i);

const clickResult = (page) => page.evaluate(() => { const { item, hit } = window.__ct; return !!(hit && item && item.isConnected && item.contains(hit)); });

async function clickTest(page, count, flapIndicators) {
  let landed = 0, targets = 0;
  await page.evaluate(() => { window.__ct.active = true; });
  if (flapIndicators) await page.evaluate(() => { let on = false; window.__flap = setInterval(() => { on = !on; window.state.micMuted = on; window.state.voiceSpeaking = on ? 'local' : ''; }, 330); });
  for (let i = 0; i < count; i++) {
    const t = await clickTarget(page, i);
    if (!t) continue;
    targets = t.count;
    await page.mouse.move(t.x, t.y);
    await page.mouse.down();
    await wait(20);
    await page.mouse.up();
    if (await clickResult(page)) landed++;
    await wait(15);
  }
  await page.evaluate(() => { window.__ct.active = false; });
  if (flapIndicators) await page.evaluate(() => { clearInterval(window.__flap); });
  return { landed, attempts: count, targets };
}

const measure = async (page, ms) => {
  await page.evaluate(() => window.__rp.start());
  await wait(ms);
  const out = await page.evaluate(() => { const r = window.__rp.stop(); const sm = window.__rp.samples.splice(0); return { r, sm, by: { ...window.__rpBy } }; });
  if (process.env.REDRAW_DEBUG && out.sm.length) console.log('removed samples:\n  ' + out.sm.slice(0, 40).join('\n  '));
  if (process.env.REDRAW_DEBUG) console.log('signal writes: ' + JSON.stringify(out.by));
  return out.r;
};

async function startRig() {
  const devPort = await freePort();
  const relayPort = await freePort();
  const relay = new EphemeralRelay({ WebSocketServer, port: relayPort });
  const dev = spawn('node', ['scripts/dev-server.mjs'], { cwd: root, env: { ...process.env, ZELLOUS_LOCAL_DEPS: '1', PORT: String(devPort) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { const up = await fetch('http://127.0.0.1:' + devPort + '/nostr-chat/').then((r) => r.ok).catch(() => false); if (up) break; await wait(250); }
  return { devPort, relayPort, relay, dev };
}

async function bootPage(browser, rig, name) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', (e) => page.errs.push(e.message));
  await page.addInitScript((port) => { const W = window.WebSocket; window.WebSocket = function (u, p) { return new W('ws://127.0.0.1:' + port, p); }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); }, rig.relayPort);
  await page.goto('http://127.0.0.1:' + rig.devPort + '/nostr-chat/?local=1');
  await page.waitForFunction(() => window.appReady === true, null, { timeout: 45000 });
  await page.getByText('Continue without a backup').click().catch(() => {});
  await page.evaluate(() => { window.stateSignals.setupOpen.value = false; });
  await page.evaluate((n) => { window.__name = n; }, name);
  return page;
}

const openChannel = (page, name) => page.evaluate((n) => { const ch = (window.state.channels || []).find((c) => c.name === n); if (!ch) return false; window.ui.actions.switchChannel(ch); return true; }, name);

const rows = [];
const failed = [];
const fmt = (n) => String(n).padStart(7);
const report = (scenario, stats, budget) => {
  rows.push({ scenario, surface: 'renders/s', nodes: stats.__renders, mutPerSec: 0, removed: 0, added: 0, attrs: 0, text: 0, replaced: 0, over: false, bare: true });
  for (const name of Object.keys(SURFACES)) {
    const s = stats[name];
    const sidebar = SIDEBAR.includes(name);
    const over = sidebar && (s.mutPerSec > budget || s.replaced > 0 || s.removed > 0);
    rows.push({ scenario, surface: name, ...s, over });
    if (over) failed.push(scenario + ':' + name);
  }
};

async function main() {
  const wav = micWav();
  const rig = await startRig();
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=' + wav, '--autoplay-policy=no-user-gesture-required'], ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {}) });
  try {
    const A = await bootPage(browser, rig, 'A');
    const B = await bootPage(browser, rig, 'B');
    await wait(2500);
    const serverId = await A.evaluate(async () => { await window.__zellous.servers.create('redraw-' + Date.now().toString(36)); return window.state.currentServerId; });
    await wait(2500);
    await A.evaluate(async () => { await window.channelManager.create('vroom', 'voice'); await window.channelManager.create('vthread', 'voice-thread'); });
    await B.evaluate(async (id) => { await window.__zellous.servers.join(id, { name: 'redraw' }); }, serverId);
    await wait(3500);
    for (let i = 0; i < 4; i++) await A.evaluate((i) => window.chat.send('redraw message ' + i), i);
    await wait(1500);
    await A.evaluate(probeInstall, SURFACES);
    await B.evaluate(probeInstall, SURFACES);
    const names = await A.evaluate(() => (window.state.channels || []).map((c) => c.name + ':' + c.type));
    console.log('channels ' + names.join(' '));

    await openChannel(A, 'general');
    await wait(1500);
    report('idle', await measure(A, WINDOW_MS), IDLE_BUDGET);

    const talker = setInterval(() => { B.evaluate(() => window.chat.send('b says ' + Date.now())).catch(() => {}); }, 2000);
    report('text', await measure(A, WINDOW_MS), IDLE_BUDGET);
    clearInterval(talker);

    await A.locator('.ds-g3-ibtn[aria-label="user settings"]').click();
    await wait(800);
    console.log('settings surface nodes: ' + await A.evaluate(() => document.querySelectorAll('.ds-g3-set').length + ' gear=' + document.querySelectorAll('.ds-g3-ibtn[aria-label="user settings"]').length));
    const talker2 = setInterval(() => { B.evaluate(() => window.chat.send('b settings ' + Date.now())).catch(() => {}); }, 2000);
    report('settings-open', await measure(A, WINDOW_MS), IDLE_BUDGET);
    clearInterval(talker2);
    await A.keyboard.press('Escape');
    await wait(500);
    await A.locator('.ds-g3-compbtn[title="Emoji"]').click();
    await wait(800);
    const talker3 = setInterval(() => { B.evaluate(() => window.chat.send('b picker ' + Date.now())).catch(() => {}); }, 2000);
    report('picker-open', await measure(A, WINDOW_MS), IDLE_BUDGET);
    clearInterval(talker3);
    await A.keyboard.press('Escape');
    await wait(500);

    for (const P of [A, B]) await P.evaluate(() => { const ch = window.state.channels.find((c) => c.name === 'vroom'); localStorage.setItem('zn_voice_mode_' + ch.id, 'realtime'); });
    await openChannel(A, 'vroom');
    await openChannel(B, 'vroom');
    await A.waitForFunction(() => window.state.voiceConnected === true, null, { timeout: 30000 });
    await B.waitForFunction(() => window.state.voiceConnected === true, null, { timeout: 30000 });
    await wait(2500);
    await wait(5000);
    const participants = await A.evaluate(() => (window.state.voiceParticipants || []).length);
    console.log('voice participants seen by A: ' + participants);
    report('voice-room', await measure(A, WINDOW_MS), LIVE_BUDGET);
    const click = await clickTest(A, CLICKS, true);
    console.log('click test (voice room live, mute and speaking indicators flipping 3 times a second): landed ' + click.landed + '/' + click.attempts + ' over ' + click.targets + ' sidebar items');
    if (click.landed < click.attempts) failed.push('click:' + click.landed + '/' + click.attempts);

    await A.evaluate(() => window.lk.disconnect());
    await B.evaluate(() => window.lk.disconnect());
    await wait(1500);
    await openChannel(A, 'vthread');
    await openChannel(B, 'vthread');
    await wait(1500);
    if (process.env.REDRAW_DEBUG) console.log('thread buttons: ' + JSON.stringify(await A.evaluate(() => [...document.querySelectorAll('#app-main button, #app-main [role=button]')].map((b) => (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 30)))));
    const joined = await Promise.all([A, B].map((p) => p.evaluate(async () => { const b = [...document.querySelectorAll('#app-main button, #app-main [role=button]')].find((x) => /join/i.test(x.textContent || '')); if (b) b.click(); return !!b; })));
    console.log('voice thread join buttons clicked: ' + joined.join(','));
    await wait(4000);
    report('voice-thread', await measure(A, WINDOW_MS), LIVE_BUDGET);
    const click2 = await clickTest(A, Math.min(CLICKS, 100));
    console.log('click test (voice thread live): landed ' + click2.landed + '/' + click2.attempts);
    if (click2.landed < click2.attempts) failed.push('click-thread:' + click2.landed + '/' + click2.attempts);
    console.log('page errors A: ' + JSON.stringify(A.errs.slice(0, 3)));
  } finally {
    await browser.close().catch(() => {});
    try { rig.dev.kill(); } catch {}
    try { rig.relay.close?.(); } catch {}
  }
  console.log(['scenario', 'surface', 'nodes', 'mut/s', 'removed', 'added', 'attrs', 'text', 'replaced', 'verdict'].map((h, i) => i < 2 ? h.padEnd(13) : h.padStart(8)).join(' '));
  for (const r of rows) if (r.bare) console.log(r.scenario.padEnd(13) + ' ' + r.surface.padEnd(13) + ' ' + fmt(r.nodes)); else console.log([r.scenario.padEnd(13), r.surface.padEnd(13), fmt(r.nodes), fmt(r.mutPerSec), fmt(r.removed), fmt(r.added), fmt(r.attrs), fmt(r.text), fmt(r.replaced), (r.over ? 'OVER' : 'ok').padStart(8)].join(' '));
}

try { await main(); } catch (e) { console.log('REDRAW ERROR', e.stack || e.message); failed.push('error'); }
console.log(failed.length ? 'REDRAW_FAIL ' + failed.join(' | ') : 'REDRAW_OK');
process.exit(failed.length ? 1 : 0);
