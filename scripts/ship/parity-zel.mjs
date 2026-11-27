import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { NOW_MS, NOW_SEC, PEOPLE, MESSAGES, CHANNELS, SERVER_NAME, secretOf } from './parity-fixture.mjs';
import { discord } from './parity-ref.mjs';

const root = new URL('../..', import.meta.url).pathname;
const require = createRequire(root + 'package.json');
const wireweaveDir = process.env.WIREWEAVE_DIR || new URL('../../../wireweave', import.meta.url).pathname;
const { WebSocketServer, WebSocket } = await import(wireweaveDir + '/node_modules/ws/wrapper.mjs');
const { EphemeralRelay } = await import(wireweaveDir + '/src/ephemeral-relay.js');
const NT = require(wireweaveDir + '/node_modules/nostr-tools/lib/cjs/pure.js');

export const pubkeyOf = (key) => NT.getPublicKey(hexToBytes(secretOf(key)));
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const sha = (s) => createHash('sha256').update(s).digest('hex');
const hexToBytes = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));

export async function startRig() {
  const devPort = await freePort();
  const relayPort = await freePort();
  const relay = new EphemeralRelay({ WebSocketServer, port: relayPort });
  const dev = spawn('node', ['scripts/dev-server.mjs'], { cwd: root, env: { ...process.env, ZELLOUS_LOCAL_DEPS: '1', PORT: String(devPort) }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { const up = await fetch('http://127.0.0.1:' + devPort + '/nostr-chat/').then((r) => r.ok).catch(() => false); if (up) break; await wait(250); }
  return { devPort, relayPort, relay, dev, stop() { try { dev.kill(); } catch {} try { relay.close?.(); } catch {} } };
}

const ID_FOR = {
  channels: [
    { id: 'rules', name: 'rules', type: 'page', categoryId: 'info' },
    { id: 'pick-roles', name: 'pick-roles', type: 'page', categoryId: 'info' },
    { id: 'announcements', name: 'announcements', type: 'announcement', categoryId: 'info' },
    ...CHANNELS.text.filter((n) => n !== 'announcements').map((n) => ({ id: n, name: n, type: 'text', categoryId: 'text' })),
    ...CHANNELS.voice.map((n) => ({ id: n, name: n, type: 'voice', categoryId: 'voice' })),
  ].map((c, position) => ({ ...c, position, ...(discord.TOPIC[c.name] ? { topic: discord.TOPIC[c.name] } : {}) })),
  categories: [{ id: 'info', name: 'Information', position: 0 }, { id: 'text', name: 'Text Channels', position: 1 }, { id: 'voice', name: 'Voice Channels', position: 2 }],
};

const sendEvents = (relayPort, events) => new Promise((resolve, reject) => {
  const ws = new WebSocket('ws://127.0.0.1:' + relayPort);
  ws.on('open', () => { for (const e of events) ws.send(JSON.stringify(['EVENT', e])); setTimeout(() => { ws.close(); resolve(); }, 600); });
  ws.on('error', reject);
});

export async function seedMessages(relayPort, sid) {
  const sks = Object.fromEntries(Object.keys(PEOPLE).map((k) => [k, hexToBytes(secretOf(k))]));
  const pks = Object.fromEntries(Object.entries(sks).map(([k, sk]) => [k, NT.getPublicKey(sk)]));
  const events = [];
  for (const [k, p] of Object.entries(PEOPLE)) events.push(NT.finalizeEvent({ kind: 0, created_at: NOW_SEC - 86400, tags: [], content: JSON.stringify({ name: p.name }) }, sks[k]));
  const reactionEvents = [];
  for (const ch of CHANNELS.text) {
    const chanHex = sha(sid + ':' + ch);
    const made = [];
    (MESSAGES[ch] || []).forEach((m) => {
      const tags = [['e', chanHex, '', 'root']];
      if (m.replyTo !== undefined) tags.push(['e', made[m.replyTo].id, '', 'reply']);
      const ev = NT.finalizeEvent({ kind: 42, created_at: NOW_SEC - m.min * 60, tags, content: m.text }, sks[m.by]);
      made.push(ev);
      events.push(ev);
      for (const [emoji, who] of m.reactions || []) for (const w of who) reactionEvents.push(NT.finalizeEvent({ kind: 7, created_at: NOW_SEC - 60, tags: [['e', ev.id], ['k', '42'], ['p', ev.pubkey]], content: emoji }, sks[w]));
    });
  }
  await sendEvents(relayPort, [...events, ...reactionEvents]);
  return pks;
}

export async function bootZel(browser, rig, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' });
  await ctx.addInitScript(([port, sk, pk]) => {
    localStorage.setItem('zn_sk', sk);
    localStorage.setItem('zn_pk', pk);
    localStorage.setItem('zellous-setup', JSON.stringify({ toastShown: true, dismissed: true }));
    const W = window.WebSocket;
    window.WebSocket = function (u, p) { return new W('ws://127.0.0.1:' + port, p); };
    window.WebSocket.prototype = W.prototype;
    Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  }, [rig.relayPort, secretOf('me'), NT.getPublicKey(hexToBytes(secretOf('me')))]);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW_MS);
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(e.message));
  await page.goto('http://127.0.0.1:' + rig.devPort + '/nostr-chat/?local=1');
  await page.waitForFunction(() => window.appReady === true, null, { timeout: 45000 });
  await page.getByText('Continue without a backup').click().catch(() => {});
  await page.evaluate(() => { window.stateSignals.setupOpen.value = false; });
  const name = await page.evaluate((n) => window.auth.setDisplayName(n).then(() => true), PEOPLE.me.name);
  const sid = await page.evaluate(async (def) => {
    await window.__zellous.servers.create('game 3', '#c4602f');
    await new Promise((r) => setTimeout(r, 800));
    const ch = window.__zellous.wireweave.channels;
    ch.channels = def.channels; ch.categories = def.categories;
    await ch._publish();
    ch._emit('updated', { channels: ch.channels, categories: ch.categories });
    return window.state.currentServerId;
  }, ID_FOR);
  await seedMessages(rig.relayPort, sid);
  await seedMessages(rig.relayPort, '0'.repeat(64) + ':public');
  await page.evaluate(() => { const c = window.state.channels.find((x) => x.name === 'general'); window.ui.actions.switchChannel(c); });
  await wait(1500);
  return { page, sid };
}
