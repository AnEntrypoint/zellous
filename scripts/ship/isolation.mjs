import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const root = new URL('../..', import.meta.url).pathname;
const wireweaveDir = process.env.WIREWEAVE_DIR || new URL('../../../wireweave', import.meta.url).pathname;
const designDir = process.env.DESIGN_DIR || new URL('../../../design', import.meta.url).pathname;
const { WebSocketServer } = await import(wireweaveDir + '/node_modules/ws/wrapper.mjs');
const { EphemeralRelay } = await import(wireweaveDir + '/src/ephemeral-relay.js');
import { spawn } from 'node:child_process';

const failed = [];
const check = (name, ok, detail) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); if (!ok) failed.push(name); };

const walk = (dir, out = []) => {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'vendor' || n === 'dist' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.js') || p.endsWith('.mjs')) out.push(p);
  }
  return out;
};
const sources = [...walk(wireweaveDir + '/src'), ...walk(root + 'docs/js'), ...walk(designDir + '/src')].filter((p) => !p.includes('/vad/') && !p.includes('/kits/') && !p.includes('/freddie/'));
const hashHelperBodies = /serverId \|\| 'default'|serverId \|\| "default"/;
const oneArgHex = /hexChannelId\(\s*[A-Za-z_.$]+\s*\)/;
const defaultHits = [], oneArgHits = [];
for (const p of sources) {
  const text = readFileSync(p, 'utf8');
  text.split('\n').forEach((line, i) => {
    if (hashHelperBodies.test(line)) defaultHits.push(p.replace(root, '') + ':' + (i + 1));
    if (oneArgHex.test(line)) oneArgHits.push(p.replace(root, '') + ':' + (i + 1));
  });
}
check('static: no silent default server in a room id', defaultHits.length === 0, defaultHits.slice(0, 5).join(' '));
check('static: no room id helper called without a server id', oneArgHits.length === 0, oneArgHits.slice(0, 5).join(' '));

const PORT = 5192, RPORT = 7492;
const PUB = '0000000000000000000000000000000000000000000000000000000000000000:public';
const relay = new EphemeralRelay({ WebSocketServer, port: RPORT });
const dev = spawn('node', ['scripts/dev-server.mjs'], { cwd: root, env: { ...process.env, ZELLOUS_LOCAL_DEPS: '1', PORT: String(PORT) }, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const launchOptions = { headless: true, args: ['--no-sandbox'], ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {}) };
const wsInit = (port) => { const W = window.WebSocket; window.WebSocket = function (u, p) { return new W('ws://127.0.0.1:' + port, p); }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); };
const ready = async (page) => {
  await page.waitForFunction(() => window.appReady === true, null, { timeout: 30000 });
  await page.getByText('Continue without a backup').click().catch(() => {});
  await page.evaluate(() => { window.stateSignals.setupOpen.value = false; });
};
const boot = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(wsInit, RPORT);
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:' + PORT + '/nostr-chat/?local=1');
  await ready(page);
  return page;
};
const texts = (p) => p.evaluate(() => (window.state.chatMessages || []).map((m) => m.content || m.text));
const cur = (p) => p.evaluate(() => ({ sid: window.state.currentServerId, ch: window.state.currentChannelId }));
const to = (p, sid) => p.evaluate(async (id) => { await window.serverManager.switchTo(id); }, sid);
const send = (p, t) => p.evaluate(async (x) => { await window.chat.send(x); }, t);
const reload = async (p) => { await p.reload(); await ready(p); await wait(4500); };
const lacks = (list, needles) => needles.every((n) => !list.some((t) => String(t).includes(n)));
const has = (list, needles) => needles.every((n) => list.some((t) => String(t).includes(n)));

try {
  await wait(2500);
  const browser = await chromium.launch(launchOptions);
  const A = await boot(browser);
  const B = await boot(browser);
  const C = await boot(browser);
  await wait(3500);
  await A.evaluate(async () => { await window.__zellous.servers.create('hi'); });
  await wait(3500);
  const HI = (await cur(A)).sid;
  await B.evaluate(async (id) => { await window.__zellous.servers.join(id, { name: 'hi' }); }, HI);
  await wait(3500);
  check('setup: two distinct servers, C on public', HI && HI !== PUB && (await cur(C)).sid === PUB && (await cur(B)).sid === HI);

  await send(A, 'HI-TEXT-1');
  await send(A, '📊¦HI-POLL¦yes¦no');
  await wait(3000);
  const hiMsgId = await A.evaluate(() => (window.state.chatMessages.find((m) => (m.content || '').includes('HI-TEXT-1')) || {}).id);
  const hiAuthor = await A.evaluate(() => window.state.nostrPubkey);
  await B.evaluate(async ([id, a]) => { await window.nostrReactions.react(id, a, '🔥'); }, [hiMsgId, hiAuthor]);
  await A.evaluate(async ([sid, id]) => { await window.nostrPins.pin(sid, 'general', id); }, [HI, hiMsgId]);
  await wait(3000);
  const cHi = await texts(C);
  check('hi text, poll in hi: visible in hi (A, B)', has(await texts(A), ['HI-TEXT-1', 'HI-POLL']) && has(await texts(B), ['HI-TEXT-1', 'HI-POLL']));
  check('hi text, poll in hi: never in the public general', lacks(cHi, ['HI-TEXT-1', 'HI-POLL']), JSON.stringify(cHi));
  check('hi pin: not a pin of the public general', (await C.evaluate((p) => window.nostrPins.ids(p, 'general'), PUB)).length === 0 && (await C.evaluate(() => (window.state.channelPins || []).length)) === 0);
  check('hi unread: public general counts nothing', !((await C.evaluate(() => window.nostrUnread.countsFor())).general > 0));

  await send(C, 'PUB-TEXT-1');
  await send(C, '📊¦PUB-POLL¦a¦b');
  await wait(3000);
  const aHi = await texts(A), bHi = await texts(B);
  check('public text, poll: never in hi (A, B)', lacks(aHi, ['PUB-TEXT-1', 'PUB-POLL']) && lacks(bHi, ['PUB-TEXT-1', 'PUB-POLL']));
  check('public text, poll: visible in the public general', has(await texts(C), ['PUB-TEXT-1', 'PUB-POLL']));

  await to(A, PUB); await wait(3500);
  const aPub = await texts(A);
  check('server switch hi to public: public history has no hi message', lacks(aPub, ['HI-TEXT-1', 'HI-POLL']) && has(aPub, ['PUB-TEXT-1']), JSON.stringify(aPub));
  await send(B, 'HI-LIVE-2'); await wait(2500);
  check('server switch: a live hi message does not reach a viewer of public', lacks(await texts(A), ['HI-LIVE-2']));
  await to(A, HI); await wait(3500);
  const aBack = await texts(A);
  check('server switch public to hi: hi history has no public message', lacks(aBack, ['PUB-TEXT-1', 'PUB-POLL']) && has(aBack, ['HI-TEXT-1', 'HI-LIVE-2']), JSON.stringify(aBack));
  for (let i = 0; i < 4; i++) { await to(A, PUB); await to(A, HI); }
  await to(A, PUB); await wait(3000);
  await send(C, 'PUB-LIVE-2'); await send(B, 'HI-LIVE-3'); await wait(3000);
  check('rapid switching: the viewer sees only the server shown', lacks(await texts(A), ['HI-LIVE-3', 'HI-TEXT-1']) && has(await texts(A), ['PUB-LIVE-2']));

  await reload(A);
  const sidA = (await cur(A)).sid;
  const aReload = await texts(A);
  const wrong = sidA === PUB ? ['HI-TEXT-1', 'HI-LIVE-2', 'HI-LIVE-3'] : ['PUB-TEXT-1', 'PUB-LIVE-2'];
  check('reload: the restored server shows only its own messages', lacks(aReload, wrong) && aReload.length > 0, sidA.slice(-8) + ' ' + JSON.stringify(aReload));
  await reload(B);
  check('reload: hi viewer sees no public message', lacks(await texts(B), ['PUB-TEXT-1', 'PUB-LIVE-2', 'PUB-POLL']));

  await to(A, null); await wait(2000);
  const before = relay.events.filter((e) => e.kind === 42).length;
  await send(A, 'NO-SERVER-1').catch(() => {});
  await wait(2500);
  check('no server selected: a send publishes nothing', relay.events.filter((e) => e.kind === 42).length === before);

  const expected = new Set([sha(HI + ':general'), sha(PUB + ':general'), sha(HI + ':announcements'), sha(PUB + ':announcements')]);
  const roomTags = relay.events.filter((e) => e.kind === 42).map((e) => (e.tags.find((t) => t[0] === 'e') || [])[1]);
  check('relay: every message is addressed to a server scoped room', roomTags.length > 0 && roomTags.every((t) => expected.has(t)), roomTags.filter((t) => !expected.has(t)).map((t) => t.slice(0, 10)).join(','));
  check('relay: nothing addressed to the default room', !roomTags.includes(sha('default:general')));
  const pinTags = relay.events.filter((e) => e.kind === 30078 && (e.tags.find((t) => t[0] === 'd') || [])[1]?.startsWith('zellous-pins'));
  check('relay: every pin names its server', pinTags.every((e) => (e.tags.find((t) => t[0] === 'd')[1]).includes(HI) || (e.tags.find((t) => t[0] === 'd')[1]).includes(PUB)));
  await browser.close();
} catch (e) { console.log('ISOLATION ERROR', e.message); failed.push('error'); }
console.log(failed.length ? 'ISOLATION_FAIL ' + failed.join(' | ') : 'ISOLATION_OK');
try { dev.kill(); } catch {}
try { relay.close?.(); } catch {}
process.exit(failed.length ? 1 : 0);
