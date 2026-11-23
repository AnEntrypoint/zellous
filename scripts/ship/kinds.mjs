import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const wireweaveDir = process.env.WIREWEAVE_DIR || new URL('../../../wireweave', import.meta.url).pathname;
const { WebSocketServer } = await import(wireweaveDir + '/node_modules/ws/wrapper.mjs');
const { EphemeralRelay } = await import(wireweaveDir + '/src/ephemeral-relay.js');
import { spawn } from 'node:child_process';
const launchOptions = { headless: true, args: ['--no-sandbox'], ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {}) };
const PORT = 5190, RPORT = 7490;
const relay = new EphemeralRelay({ WebSocketServer, port: RPORT });
const dev = spawn('node', ['scripts/dev-server.mjs'], { cwd: new URL('../..', import.meta.url).pathname, env: { ...process.env, ZELLOUS_LOCAL_DEPS: '1', PORT: String(PORT) }, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = [];
const done = async (code) => { try { dev.kill(); } catch {} try { relay.close?.(); } catch {} process.exit(code); };
try {
  await wait(2500);
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript((port) => { const W = window.WebSocket; window.WebSocket = function (u, p) { return new W('ws://127.0.0.1:' + port, p); }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); }, RPORT);
  await page.goto('http://127.0.0.1:' + PORT + '/nostr-chat/?local=1');
  await page.waitForFunction(() => window.appReady === true, null, { timeout: 30000 });
  await page.getByText('Continue without a backup').click().catch(() => {});
  await page.evaluate(() => { window.stateSignals.setupOpen.value = false; });
  await page.evaluate(async () => { await window.__zellous.servers.create('gate-' + Date.now().toString(36)); });
  await wait(4000);
  const seed = 'ab'.repeat(32);
  const kinds = [
    ['plain', 'plain gate message', '.ds-g3-tx'],
    ['sticker', '🏷¦mustard', '.ds-g3-stk'],
    ['poll', '📊¦Pick one¦red¦blue', '.ds-g3-poll, .ds-g3-pollc, [class*=ds-g3-poll]'],
    ['link', 'https://example.com/page', 'a[href="https://example.com/page"]'],
    ['sharesies', 'https://anentrypoint.github.io/sharesies/#' + seed, '.ds-g3-shcard'],
  ];
  const sid = await page.evaluate(() => window.state.currentServerId);
  for (const [name, text, sel] of kinds) {
    await page.evaluate((t) => window.chat.send(t), text);
    await wait(2300);
    const ok = await page.evaluate((s) => !!document.querySelector(s), sel);
    const rows = await page.evaluate(() => document.querySelectorAll('.ds-g3-msg').length);
    console.log(name.padEnd(10), ok ? 'rendered' : 'MISSING', 'rows=' + rows);
    if (!ok) failed.push(name);
  }
  await page.evaluate((id) => window.nostrMembership.invite(id, 'gate server', '#5865F2'), sid); await wait(2500);
  const inv = await page.evaluate(() => !!document.querySelector('.ds-g3-inv:not(.ds-g3-shcard)'));
  console.log('invite'.padEnd(10), inv ? 'rendered' : 'MISSING'); if (!inv) failed.push('invite');
  const body = await page.evaluate(() => !!document.querySelector('.ds-g3-comp textarea') && document.querySelectorAll('.ds-g3-msg').length >= 5);
  if (!body) failed.push('chat-body');
  if (errs.length) { console.log('PAGE ERRORS', errs.slice(0, 3)); failed.push('page-errors'); }
  await browser.close();
} catch (e) { console.log('GATE ERROR', e.message); failed.push('error'); }
console.log(failed.length ? 'KINDS_FAIL ' + failed.join(',') : 'KINDS_OK');
await done(failed.length ? 1 : 0);
