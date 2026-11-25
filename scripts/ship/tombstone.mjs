import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const wireweaveDir = process.env.WIREWEAVE_DIR || new URL('../../../wireweave', import.meta.url).pathname;
const { WebSocketServer } = await import(wireweaveDir + '/node_modules/ws/wrapper.mjs');
const { EphemeralRelay } = await import(wireweaveDir + '/src/ephemeral-relay.js');
const launchOptions = { headless: true, args: ['--no-sandbox'], ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {}) };
const PORT = 5231, RPORT = 7531;
const relay = new EphemeralRelay({ WebSocketServer, port: RPORT });
const dev = spawn('node', ['scripts/dev-server.mjs'], { cwd: new URL('../..', import.meta.url).pathname, env: { ...process.env, ZELLOUS_LOCAL_DEPS: '1', PORT: String(PORT) }, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const failed = [];
const check = (name, ok, detail) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); if (!ok) failed.push(name); };
const until = async (fn, ms = 12000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(250); } return false; };
const SHEAD = '.shead';

const remap = (port) => { const W = window.WebSocket; window.WebSocket = function (u, p) { return new W('ws://127.0.0.1:' + port, p); }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); };
const boot = async (browser, storageState) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(storageState ? { storageState } : {}) });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', (e) => page.errs.push(e.message));
  await page.addInitScript(remap, RPORT);
  await page.goto('http://127.0.0.1:' + PORT + '/nostr-chat/?local=1');
  await page.waitForFunction(() => window.appReady === true, null, { timeout: 30000 });
  await page.getByText('Continue without a backup').click().catch(() => {});
  await page.evaluate(() => { window.stateSignals.setupOpen.value = false; });
  return { ctx, page };
};
const pubkey = (p) => p.evaluate(() => window.state.nostrPubkey);
const hasServer = (p, sid) => p.evaluate((id) => (window.state.servers || []).some((s) => s && s.id === id), sid);
const openServerSettings = async (page) => {
  await page.click(SHEAD);
  await page.click('.ds-g3-smenu [role=menuitem]:has-text("Server Settings")');
  await wait(400);
};

const done = (code) => { try { dev.kill(); } catch {} try { relay.close?.(); } catch {} process.exit(code); };
try {
  await wait(2500);
  const browser = await chromium.launch(launchOptions);
  const owner = await boot(browser), admin = await boot(browser), member = await boot(browser), sleeper = await boot(browser), joiner = await boot(browser);
  const name = 'tomb-' + Date.now().toString(36);
  await owner.page.evaluate(async (n) => { await window.__zellous.servers.create(n); }, name);
  await wait(3500);
  const sid = await owner.page.evaluate(() => window.state.currentServerId);
  const ownerPk = await pubkey(owner.page), adminPk = await pubkey(admin.page);
  check('owner id prefix is the owner pubkey', sid.startsWith(ownerPk + ':'), sid);
  await owner.page.evaluate(() => window.chat.send('owner witness message'));
  await wait(1500);
  for (const who of [admin, member, sleeper]) await who.page.evaluate(async (id) => { await window.__zellous.servers.join(id, { name: 'x' }); }, sid);
  await wait(3000);
  await owner.page.evaluate(async ([id, pk]) => { await window.serverRoles.setRole(id, pk, 'admin'); }, [sid, adminPk]);
  await wait(2000);
  check('member lists the server before', await hasServer(member.page, sid));
  check('admin is admin', await admin.page.evaluate((id) => window.serverRoles.isAdmin(id), sid));

  await owner.page.evaluate(async ([id, n, pk]) => {
    const ww = window.__zellous.wireweave;
    const signed = await ww.auth.sign({ kind: 30078, created_at: Math.floor(Date.now() / 1000), tags: [['d', 'zellous-discover:' + id], ['t', 'zellous-discover']], content: JSON.stringify({ v: 1, serverId: id, status: 'listed', action: 'promote', by: pk, name: n, description: 'witness listing', icon: '', category: 'other', tags: [], language: 'en', guidelines: true }) });
    ww.pool.publish(signed);
  }, [sid, name, ownerPk]);
  await wait(1500);

  await joiner.page.evaluate(async () => { await window.__zellous.servers.create('other-' + Date.now().toString(36)); });
  await wait(3000);
  await joiner.page.evaluate(([id, n]) => window.nostrMembership.invite(id, n, '#5865F2'), [sid, name]);
  await joiner.page.waitForSelector('.ds-g3-inv', { timeout: 10000 });
  const invBefore = await joiner.page.evaluate(() => document.querySelector('.ds-g3-inv').innerText.replace(/\s+/g, ' '));
  check('invite card before delete offers Join', /Join/.test(invBefore) && !/deleted/i.test(invBefore), invBefore);
  await joiner.page.click('.ca-rail-server-explore >> visible=true');
  const listedBefore = await until(() => joiner.page.evaluate((n) => [...document.querySelectorAll('.ds-g3-scrim')].some((el) => el.innerText.includes(n)), name), 8000);
  check('Discover lists the server before delete', listedBefore);
  await joiner.page.keyboard.press('Escape');
  await wait(400);

  await admin.page.evaluate(async (id) => {
    const ww = window.__zellous.wireweave;
    const signed = await ww.auth.sign({ kind: 34550, created_at: Math.floor(Date.now() / 1000) + 5, tags: [['d', id.split(':')[1]], ['name', 'forged'], ['deleted', '1']], content: '' });
    ww.pool.publish(signed);
  }, sid);
  await wait(3000);
  check('forged tombstone by admin: member still has the server', await hasServer(member.page, sid));
  check('forged tombstone by admin: owner still has the server', await hasServer(owner.page, sid));
  check('forged tombstone by admin: server not marked deleted', !(await member.page.evaluate((id) => window.serverManager.isDeleted(id), sid)));
  await openServerSettings(admin.page);
  const adminText = await admin.page.evaluate(() => document.body.innerText);
  check('admin sees no Delete Server control', !/Delete Server/.test(adminText) && !(await admin.page.$('.ds-g3-evb-danger')));
  await admin.page.keyboard.press('Escape');

  const sleeperState = await sleeper.ctx.storageState();
  await sleeper.ctx.close();

  await openServerSettings(owner.page);
  await owner.page.click('.ds-g3-set :text("Overview")').catch(() => {});
  await wait(300);
  const delBtn = '.ds-g3-evb-danger:has-text("Delete Server")';
  check('owner sees Delete Server', !!(await owner.page.$(delBtn)));
  await owner.page.click(delBtn);
  await owner.page.waitForSelector('[role=alertdialog]');
  const dlg = await owner.page.evaluate(() => document.querySelector('[role=alertdialog]').innerText.replace(/\s+/g, ' '));
  check('dialog states relays may keep messages', /Some may keep old messages/.test(dlg), dlg.slice(0, 160));
  const confirmBtn = '[role=alertdialog] .ds-g3-evb-danger';
  const disabledOf = () => owner.page.getAttribute(confirmBtn, 'aria-disabled');
  check('confirm disabled with empty name', (await disabledOf()) === 'true');
  await owner.page.fill('[role=alertdialog] input', name.slice(0, -1));
  check('confirm disabled with wrong name', (await disabledOf()) === 'true');
  await owner.page.click(confirmBtn, { force: true });
  await wait(800);
  check('clicking disabled confirm keeps the server', (await hasServer(owner.page, sid)) && !!(await owner.page.$('[role=alertdialog]')));
  await owner.page.keyboard.press('Escape');
  await wait(400);
  check('Escape closes only the dialog', !(await owner.page.$('[role=alertdialog]')) && !!(await owner.page.$('.ds-g3-set')));
  check('focus returns to the Delete Server button', await owner.page.evaluate(() => document.activeElement && /Delete Server/.test(document.activeElement.textContent)));
  await owner.page.click(delBtn);
  await owner.page.waitForSelector('[role=alertdialog]');
  await owner.page.mouse.click(5, 5);
  await wait(400);
  check('scrim click closes the dialog', !(await owner.page.$('[role=alertdialog]')));
  await owner.page.click(delBtn);
  await owner.page.waitForSelector('[role=alertdialog]');
  await owner.page.focus('[role=alertdialog] .ds-g3-evx');
  await owner.page.keyboard.press('Enter');
  await wait(400);
  check('Enter on X closes the dialog', !(await owner.page.$('[role=alertdialog]')));
  await owner.page.click(delBtn);
  await owner.page.waitForSelector('[role=alertdialog]');
  await owner.page.fill('[role=alertdialog] input', name);
  check('confirm enabled with the exact name', (await disabledOf()) === 'false');
  await owner.page.click(confirmBtn);
  const ownerGone = await until(async () => !(await hasServer(owner.page, sid)), 10000);
  check('owner: server removed after delete', ownerGone);
  const tomb = relay.events.filter((e) => e.kind === 34550 && e.pubkey === ownerPk && e.tags.some((t) => t[0] === 'deleted'));
  console.log('tombstone event', JSON.stringify(tomb[0] && { kind: tomb[0].kind, tags: tomb[0].tags, content: tomb[0].content }));
  check('relay holds one owner-signed tombstone', tomb.length === 1);
  await until(async () => relay.events.some((e) => e.kind === 5 && e.pubkey === ownerPk), 9000);
  const kind5 = relay.events.filter((e) => e.kind === 5 && e.pubkey === ownerPk);
  check('relay holds kind 5 retractions by the owner', kind5.length > 0, 'count=' + kind5.length + ' tags=' + JSON.stringify(kind5.flatMap((e) => e.tags.map((t) => t[0] + ':' + String(t[1]).slice(0, 24) + (t[2] ? ':' + String(t[2]).slice(0, 4) : '')))));

  check('member: server vanished live', await until(async () => !(await hasServer(member.page, sid)), 10000));
  const send = await member.page.evaluate(async (id) => {
    const ww = window.__zellous.wireweave;
    const got = new Promise((r) => { ww.chat.addEventListener('send-blocked', (e) => r(e.detail.reason), { once: true }); setTimeout(() => r('none'), 3000); });
    await ww.chat.sendTo(id, 'general', 'after delete');
    return got;
  }, sid);
  check('member: chat send refused with server-deleted', send === 'server-deleted', send);
  const posted = relay.events.filter((e) => e.kind === 42 && e.content === 'after delete');
  check('relay received no message after delete', posted.length === 0);
  await member.page.reload();
  await member.page.waitForFunction(() => window.appReady === true, null, { timeout: 30000 });
  await wait(2500);
  check('member: server absent after reload', !(await hasServer(member.page, sid)));

  const woke = await boot(browser, sleeperState);
  check('sleeper (offline during delete): server removed on next sync', await until(async () => !(await hasServer(woke.page, sid)), 12000));
  check('sleeper: server marked deleted', await woke.page.evaluate((id) => window.serverManager.isDeleted(id), sid));

  const invAfter = await until(() => joiner.page.evaluate(() => /Server deleted/.test((document.querySelector('.ds-g3-inv') || {}).innerText || '')), 10000);
  check('invite card shows Server deleted', invAfter, await joiner.page.evaluate(() => (document.querySelector('.ds-g3-inv') || { innerText: '' }).innerText.replace(/\s+/g, ' ')));
  const joinErr = await joiner.page.evaluate(async (id) => { try { await window.__zellous.servers.join(id, { name: 'x' }); return 'joined'; } catch (e) { return e.message; } }, sid);
  check('join refused', /deleted/i.test(joinErr), joinErr);
  check('joiner did not gain the server', !(await hasServer(joiner.page, sid)));
  await joiner.page.click('.ca-rail-server-explore >> visible=true');
  await wait(2500);
  check('Discover no longer lists the server', !(await joiner.page.evaluate((n) => [...document.querySelectorAll('.ds-g3-scrim')].some((el) => el.innerText.includes(n)), name)));

  const errs = [...owner.page.errs, ...admin.page.errs, ...member.page.errs, ...joiner.page.errs, ...woke.page.errs];
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
} catch (e) { console.log('TOMBSTONE ERROR', e.message); failed.push('error'); }
console.log(failed.length ? 'TOMBSTONE_FAIL ' + failed.join(',') : 'TOMBSTONE_OK');
done(failed.length ? 1 : 0);
