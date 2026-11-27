import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import net from 'node:net';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const wireweaveDir = process.env.WIREWEAVE_DIR || new URL('../../../wireweave', import.meta.url).pathname;
const { WebSocketServer } = await import(wireweaveDir + '/node_modules/ws/wrapper.mjs');
const { EphemeralRelay } = await import(wireweaveDir + '/src/ephemeral-relay.js');
const launchOptions = { headless: true, args: ['--no-sandbox'], ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {}) };
const only = process.env.SWEEP_ONLY ? new RegExp(process.env.SWEEP_ONLY, 'i') : null;
const viewportsWanted = (process.env.SWEEP_VP || 'desktop,mobile').split(',');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

const OVERLAY_SEL = '.ov-cmd-panel,.ov-auth-panel,.vx-modal,.vx-modal-backdrop,.ds-ep-ctxmenu-backdrop,.ds-ep-ctxmenu,.ds-g3-scrim,.modal-overlay,[role=dialog],[role=alertdialog],[aria-modal=true],.ds-g3-pop-wrap,[role=menu],.ds-g3-statusmenu,.ds-g3-smenu,.context-menu,.ds-g3-sw,.ds-g3-cpick,.ds-g3-stkpop,.ds-g3-rxpick,.ds-g3-mmenu,.ds-g3-set,.ds-g3-evm,.thread-panel,.ds-g3-rename';
const CANCEL_TEXT = /^(cancel|close|close .*|discard.*|done|back|dismiss|not now|skip|maybe later|never mind|no thanks|got it|continue without a backup|×|✕|x)$/i;
const CANCEL_CLASS = /(^|[\s-])(evx|pop-x|set-close|replyx|close|cancel|dismiss|sres-clear)($|[\s-])/;

const RAIL = (sel) => ({ click: sel, rail: true });
const ME = { rail: true };
const GEAR = '.ds-g3-ibtn[aria-label="user settings"]';
const SHEAD = '.shead';
const MENUITEM = (label) => `.ds-g3-smenu [role=menuitem]:has-text("${label}")`;
const PANES = ['My Account', 'Profiles', 'Key & Security', 'Relays', 'Privacy', 'Data', 'Sync', 'Appearance', 'Accessibility', 'Voice & Audio', 'Notifications', 'Chat & Media', 'Language & Time', 'Keybinds', 'Advanced'];
const legacy = (id, js, root, extra = {}) => ({ id, open: [{ focus: SHEAD, rail: true }, { js }], root, modal: true, focus: SHEAD, ...extra });

const SURFACES = [
  { id: 'create-server', open: [RAIL('.ca-rail-server-add')], root: '.ds-g3-evm', modal: true, draft: { sel: '.ds-g3-evm input', text: 'draftname' }, focus: '.ca-rail-server-add' },
  { id: 'discover', open: [RAIL('.ca-rail-server-explore')], root: '.ds-g3-scrim', modal: true, focus: '.ca-rail-server-explore' },
  { id: 'create-text-channel', open: [RAIL('.group-add-btn[aria-label="create Text Channels"]')], root: '#channelCreateModal', modal: true, draft: { sel: '#channelCreateModal input', text: 'draftchan' }, focus: '.group-add-btn[aria-label="create Text Channels"]' },
  { id: 'create-voice-channel', open: [RAIL('.group-add-btn[aria-label="create Voice Channels"]')], root: '#channelCreateModal', modal: true, draft: { sel: '#channelCreateModal input', text: 'draftvoice' }, focus: '.group-add-btn[aria-label="create Voice Channels"]' },
  { id: 'share-terminal', open: [RAIL(SHEAD), { click: MENUITEM('Share a Terminal') }], root: '.ds-g3-scrim', modal: true, draft: { sel: '.ds-g3-scrim input', text: 'bash' }, focus: SHEAD },
  { id: 'events', open: [RAIL('.chans a:has-text("Events")')], root: '.ds-g3-scrim', modal: true, draft: { sel: '.ds-g3-scrim input', text: 'draftevent' }, focus: '.chans a:has-text("Events")' },
  { id: 'leaderboard', open: [RAIL('.chans a:has-text("Leaderboard")')], root: '.ds-g3-scrim', modal: true, focus: '.chans a:has-text("Leaderboard")' },
  { id: 'pins', open: [{ click: '.ds-g3-ibtn[aria-label="Pinned Messages"]' }], root: '.ds-g3-pop-wrap', modal: false, outside: false, focus: '.ds-g3-ibtn[aria-label="Pinned Messages"]' },
  { id: 'inbox', open: [{ click: '.ds-g3-ibtn[aria-label="Inbox"]' }], root: '.ds-g3-pop-wrap', modal: false, outside: false, focus: '.ds-g3-ibtn[aria-label="Inbox"]' },
  { id: 'settings', open: [{ click: GEAR, rail: true }], root: '.ds-g3-set', modal: true, focus: GEAR },
  ...PANES.map((pane) => ({ id: 'settings/' + pane.toLowerCase().replace(/[^a-z]+/g, '-'), open: [{ click: GEAR, rail: true }, { pane }], root: '.ds-g3-set', modal: true, focus: GEAR })),
  { id: 'server-menu', open: [RAIL(SHEAD)], root: '.ds-g3-smenu', modal: false, focus: SHEAD },
  { id: 'server-menu>roles', open: [RAIL(SHEAD), { click: MENUITEM('Roles') }], root: '.ds-g3-pop-wrap', modal: false, outside: false, focus: SHEAD },
  { id: 'server-menu>create-channel', open: [RAIL(SHEAD), { click: MENUITEM('Create Channel') }], root: '#channelCreateModal', modal: true, focus: SHEAD },
  { id: 'server-menu>discover', open: [RAIL(SHEAD), { click: MENUITEM('Discover Servers') }], root: '.ds-g3-scrim', modal: true, focus: SHEAD },
  { id: 'server-menu>settings', open: [RAIL(SHEAD), { click: MENUITEM('User Settings') }], root: '.ds-g3-set', modal: true, focus: SHEAD },
  { id: 'avatar-menu', open: [{ click: '.ds-g3-meav', rail: true }], root: '.ds-g3-avmenu', modal: false, focus: '.ds-g3-meav' },
  { id: 'status-menu', open: [{ click: '.ds-g3-mes', rail: true }], root: '.ds-g3-statusmenu', modal: false, focus: '.ds-g3-mebtn' },
  { id: 'user-menu', open: [{ rightClick: '.ds-g3-mebtn', rail: true }], root: '.ds-g3-usermenu', modal: false, focus: '.ds-g3-mebtn' },
  { id: 'user-menu>switch-identity', open: [{ rightClick: '.ds-g3-mebtn', rail: true }, { click: '.ds-g3-usermenu [role=menuitem]:has-text("Switch identity")' }], root: '.ds-g3-usermenu', modal: false, focus: '.ds-g3-mebtn', navigates: ['Back'] },
  { id: 'setup-profile', open: [{ rightClick: '.ds-g3-mebtn', rail: true }, { click: '.ds-g3-usermenu [role=menuitem]:has-text("Set up your profile")' }], root: '.ds-g3-evm', modal: true, focus: '.ds-g3-mebtn' },
  { id: 'rename', open: [{ click: '.ds-g3-men', rail: true }], root: '.ds-g3-rename', modal: false, draft: { sel: '.ds-g3-rename', text: 'draft name' }, focus: '.ds-g3-mebtn', noControls: true },
  { id: 'profile-card', open: [{ signal: ['memberListOpen', true] }, { click: '.ds-g3-mrow' }], root: '.ds-g3-scrim[aria-label$="profile"]', modal: true, focus: '.ds-g3-mrow', mobileFocus: '.ds-g3-ibtn[aria-label="Member List"]' },
  { id: 'emoji-picker', open: [{ click: '.ds-g3-compbtn[title="Emoji"]' }], root: '.ds-g3-cpick', modal: false, focus: '.ds-g3-compbtn[title="Emoji"]' },
  { id: 'sticker-picker', open: [{ click: '.ds-g3-compbtn[title="Stickers"]' }], root: '.ds-g3-stkpop', modal: false, focus: '.ds-g3-compbtn[title="Stickers"]' },
  { id: 'reaction-picker', vp: 'desktop', open: [{ message: true, hover: '.ds-g3-msg' }, { click: '.ds-g3-bar [title="Add Reaction"]' }], root: '.ds-g3-rxpick', modal: false, focus: '.ds-g3-bar [title="Add Reaction"]' },
  { id: 'message-context-menu', open: [{ focus: SHEAD, rail: true }, { js: "window.__zellous.overlays.contextMenu.show([{ label: 'Sweep item', onSelect: () => {} }], 400, 300)" }], root: '.ds-ep-ctxmenu', modal: true, focus: SHEAD },
  { id: 'reply-bar', vp: 'desktop', open: [{ message: true, hover: '.ds-g3-msg' }, { click: '.ds-g3-bar [title="Reply"]' }], root: '.ds-g3-replyx', modal: false, outside: false, focus: null },
  { id: 'quick-switcher', open: [{ focus: SHEAD, rail: true }, { key: 'Control+p' }], root: '.ds-g3-sw', modal: true, focus: SHEAD },
  { id: 'command-palette', open: [{ focus: SHEAD, rail: true }, { js: "window.__zellous.overlays.commandPalette.show([{ label: 'Sweep one' }, { label: 'Sweep two' }], () => {})" }], root: '.ov-cmd-panel', modal: true, focus: SHEAD },
  { id: 'confirm-dialog', open: [{ focus: SHEAD, rail: true }, { js: "window.ui.confirm({ title: 'Sweep confirm', message: 'Sweep message', confirmLabel: 'Delete', danger: true })" }], root: '[role=alertdialog]', modal: true, focus: SHEAD },
  { id: 'delete-server', open: [RAIL(SHEAD), { click: MENUITEM('Server Settings') }, { click: '.ds-g3-sform .ds-g3-srv-del' }], root: '[role=alertdialog]', modal: true, keep: ['div.ds-g3-scrim', 'div.ds-g3-evm'], draft: { sel: '[role=alertdialog] input', text: 'draftname' }, focus: '.ds-g3-srv-del' },
  { id: 'server-settings', open: [RAIL(SHEAD), { click: MENUITEM('Server Settings') }], root: '.ds-g3-evm', modal: true, focus: SHEAD },
  { id: 'auth-modal', open: [{ focus: SHEAD, rail: true }, { signal: ['showAuthModal', true] }], root: '.ov-auth-panel', modal: true, focus: SHEAD },
  { id: 'voice-settings', open: [{ focus: SHEAD, rail: true }, { signal: ['voiceSettingsOpen', true] }], root: '.vx-modal', modal: true, focus: SHEAD },
  { id: 'search', vp: 'desktop', open: [{ fill: ['.ds-g3-srch input', 'sweep'] }, { key: 'Enter' }], root: '.ds-g3-sres', modal: false, outside: false, focus: null },
  { id: 'thread-panel', open: [{ signal: ['threadPanelOpen', true] }], root: '.cm-thread-panel', modal: false, outside: false, focus: null },
  legacy('legacy-rename-channel', "window.channelManager.showRenameModal('x', 'general')", '#channelRenameModal', { draft: { sel: '#channelRenameModal input', text: 'draftrename' } }),
  legacy('legacy-forum-post', 'window.channelManager.showNewForumPostModal()', '#forumPostModal', { draft: { sel: '#forumPostModal input', text: 'draftpost' } }),
  legacy('legacy-create-category', 'window.channelManager.showCreateCategoryModal()', '#categoryCreateModal', { draft: { sel: '#categoryCreateModal input', text: 'draftcat' } }),
  legacy('legacy-rename-category', "window.channelManager.showRenameCategoryModal('x', 'cat')", '#categoryRenameModal', { draft: { sel: '#categoryRenameModal input', text: 'draftcatren' } }),
  legacy('legacy-key-backup', 'window.channelManager.showKeyBackupModal()', '#keyBackupModal'),
  legacy('legacy-new-dm', 'window.channelManager.showNewDmModal()', '#newDmModal', { draft: { sel: '#newDmModal input', text: 'draftdm' } }),
  legacy('legacy-profile', 'window.channelManager.showProfileModal()', '#profileModal', { draft: { sel: '#profileModal input', text: 'draftprofile' } }),
  legacy('legacy-channel-settings', "window.channelManager.showSettingsModal(window.state.currentChannel && window.state.currentChannel.id)", '#channelSettingsModal'),
  legacy('legacy-create-page', 'window.serverManager.showCreatePageModal(window.state.currentServerId)', '#pageCreateModal', { draft: { sel: '#pageCreateModal input', text: 'draftpage' } }),
  legacy('legacy-edit-page', "window.serverManager.showEditPageModal(window.state.currentServerId, 'slug', 'Title', '<p>x</p>')", '#pageEditModal', { draft: { sel: '#pageEditModal input', text: 'draftpagetitle' } }),
  legacy('legacy-edit-server', 'window.serverManager.showEditModal(window.state.currentServerId)', '#serverEditModal', { draft: { sel: '#serverEditModal input', text: 'draftsrv' } }),
  legacy('legacy-create-or-join', 'window.serverManager.showCreateOrJoinModal()', '#serverCreateOrJoinModal'),
  legacy('legacy-create-server', 'window.serverManager.showCreateModal()', '#serverCreateModal', { draft: { sel: '#serverCreateModal input', text: 'draftsrvname' } }),
  legacy('legacy-first-run-notice', "localStorage.removeItem('zellous-firstrun-key-notice'); window.ui.showFirstRunKeyNotice()", '#firstRunKeyNotice'),
];

async function startRig() {
  const devPort = await freePort();
  const relayPort = await freePort();
  const relay = new EphemeralRelay({ WebSocketServer, port: relayPort });
  const dev = spawn('node', ['scripts/dev-server.mjs'], { cwd: new URL('../..', import.meta.url).pathname, env: { ...process.env, ZELLOUS_LOCAL_DEPS: '1', PORT: String(devPort) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { const up = await fetch('http://127.0.0.1:' + devPort + '/nostr-chat/').then((r) => r.ok).catch(() => false); if (up) break; await wait(250); }
  return { devPort, relayPort, relay, dev };
}

async function bootPage(browser, rig, viewport, touch) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', (e) => page.errs.push(e.message));
  await page.addInitScript((port) => { const W = window.WebSocket; window.WebSocket = function (u, p) { return new W('ws://127.0.0.1:' + port, p); }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); }, rig.relayPort);
  await page.goto('http://127.0.0.1:' + rig.devPort + '/nostr-chat/?local=1');
  await page.waitForFunction(() => window.appReady === true, null, { timeout: 45000 });
  await page.getByText('Continue without a backup').click().catch(() => {});
  await page.evaluate(() => { window.stateSignals.setupOpen.value = false; });
  await page.evaluate(async () => { await window.__zellous.servers.create('sweep-' + Date.now().toString(36)); });
  await page.evaluate(() => window.chat.send('sweep message'));
  await page.waitForSelector('.ds-g3-msg', { timeout: 15000 }).catch(() => {});
  await wait(1500);
  return page;
}

const overlays = (page) => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((o) => o.getClientRects().length && getComputedStyle(o).visibility !== 'hidden' && getComputedStyle(o).display !== 'none').map((o) => o.tagName.toLowerCase() + '.' + String(o.className).split(/\s+/).filter(Boolean).join('.') + (o.id ? '#' + o.id : '')), OVERLAY_SEL);

async function softReset(page) {
  const dirty = await page.evaluate((sel) => !!document.querySelector('.modal-overlay.open') || [...document.querySelectorAll(sel)].some((o) => o.getClientRects().length) || (document.activeElement && document.activeElement !== document.body), OVERLAY_SEL);
  if (!dirty) return;
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => {
    const S = window.stateSignals;
    for (const k of ['gameSurface']) if (S[k]) S[k].value = null;
    for (const k of ['gamePrefOpen', 'gameServerCreateOpen', 'voiceSettingsOpen', 'settingsOpen', 'showAuthModal', 'threadPanelOpen', 'mobileMenuOpen', 'setupOpen']) if (S[k]) S[k].value = false;
    document.querySelectorAll('.modal-overlay.open').forEach((m) => m.remove());
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  });
  await page.keyboard.press('Escape').catch(() => {});
  await wait(200);
}

async function press(page, loc, mobile) {
  const box = await loc.evaluate((e) => { e.scrollIntoView({ block: 'center', inline: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, null, { timeout: 4000 });
  await wait(60);
  if (mobile) await page.touchscreen.tap(box.x, box.y); else await page.mouse.click(box.x, box.y);
}

async function openRail(page, mobile) { if (mobile) { await page.evaluate(() => { window.stateSignals.mobileMenuOpen.value = true; }); await wait(350); } }

async function runStep(page, st, mobile) {
  if (st.rail) await openRail(page, mobile);
  if (st.message) {
    if (!(await page.locator('.ds-g3-msg').count())) { await page.evaluate(() => window.chat.send('sweep message')); await page.waitForSelector('.ds-g3-msg', { timeout: 15000 }); }
    await wait(200);
  }
  if (st.click) await press(page, page.locator(st.click + ':visible').first(), mobile);
  else if (st.rightClick) {
    const loc = page.locator(st.rightClick + ':visible').first();
    if (mobile) { await loc.dispatchEvent('pointerdown'); await loc.dispatchEvent('contextmenu', { bubbles: true, cancelable: true }); }
    else { const box = await loc.evaluate((e) => { e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }); await page.mouse.click(box.x, box.y, { button: 'right' }); }
  }
  else if (st.hover) { const box = await page.locator(st.hover + ':visible').last().evaluate((e) => { e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }); await page.mouse.move(box.x, box.y); }
  else if (st.focus) await page.locator(st.focus + ':visible').first().focus();
  else if (st.fill) await page.locator(st.fill[0] + ':visible').first().fill(st.fill[1]);
  else if (st.key) await page.keyboard.press(st.key);
  else if (st.js) await page.evaluate((js) => { eval(js); }, st.js);
  else if (st.signal) await page.evaluate(([k, v]) => { window.stateSignals[k].value = v; }, st.signal);
  else if (st.pane) {
    if (mobile) await page.locator('.ds-g3-set select[aria-label="settings section"]').selectOption({ label: st.pane });
    else await press(page, page.locator('.ds-g3-set p', { hasText: new RegExp('^' + st.pane.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first(), false);
  }
  await wait(380);
}

async function doOpen(page, s, mobile) { for (const st of s.open) await runStep(page, st, mobile); }

const rootVisible = (page, root) => page.evaluate((root) => [...document.querySelectorAll(root)].some((o) => o.getClientRects().length && getComputedStyle(o).visibility !== 'hidden'), root);

async function discover(page, root) {
  return page.evaluate(({ root, CT, CC }) => {
    const ct = new RegExp(CT, 'i'); const cc = new RegExp(CC);
    const found = [];
    const roots = [...document.querySelectorAll(root)].filter((o) => o.getClientRects().length);
    const scope = roots.length ? roots : [];
    document.querySelectorAll('[data-sweep]').forEach((e) => e.removeAttribute('data-sweep'));
    for (const r of scope) {
      for (const e of r.querySelectorAll('button,[role=button],[role=menuitem],a,[tabindex],.ds-g3-evx,.ds-g3-pop-x,.ds-g3-set-close,.ds-g3-evb')) {
        if (!e.getClientRects().length || e.closest('.ds-g3-srow')) continue;
        const label = (e.getAttribute('aria-label') || e.textContent || e.title || '').trim().replace(/\s+/g, ' ');
        const cls = String(e.className || '');
        if (ct.test(label) || cc.test(cls) && !/ds-g3-evb/.test(cls) || /^(cancel|close|done|discard)/i.test(label)) {
          const n = found.length; e.setAttribute('data-sweep', String(n)); found.push({ n, label: label.slice(0, 40) || cls.slice(0, 30) });
        }
      }
    }
    return found;
  }, { root, CT: CANCEL_TEXT.source, CC: CANCEL_CLASS.source });
}

async function scrimPoint(page, root) {
  return page.evaluate((root) => {
    const r = [...document.querySelectorAll(root)].find((o) => o.getClientRects().length);
    if (!r) return null;
    const SC = '.ds-g3-scrim, .modal-overlay, .vx-modal-backdrop, .ds-ep-ctxmenu-backdrop, [class*=ov-][class*=backdrop], [class*=ov-][class*=overlay], .ov-cmd-scrim';
    const scrim = r.closest(SC) || (r.matches(SC) ? r : null) || (r.parentElement && /backdrop|scrim|overlay/.test(String(r.parentElement.className)) ? r.parentElement : null);
    if (!scrim) return null;
    const b = scrim.getBoundingClientRect();
    for (const [x, y] of [[b.left + 4, b.top + 4], [b.right - 4, b.top + 4], [b.left + 4, b.bottom - 4], [b.right - 4, b.bottom - 4], [b.left + b.width / 2, b.top + 4]]) {
      const el = document.elementFromPoint(x, y);
      if (el === scrim) return { x, y };
    }
    return 'covered';
  }, root);
}

const focusOk = (page, sel) => page.locator(sel).evaluateAll((els) => els.some((o) => o.getClientRects().length && (o === document.activeElement || o.contains(document.activeElement)))).catch(() => false);

async function runSurface(page, s, mobile, rows, base) {
  const vp = mobile ? 'mobile' : 'desktop';
  const record = (control, path, problems) => rows.push({ surface: s.id, vp, control, path, result: problems.length ? 'FAIL ' + problems.join('; ') : 'ok' });
  await softReset(page);
  try { await doOpen(page, s, mobile); } catch (e) { rows.push({ surface: s.id, vp, control: '-', path: 'open', result: 'FAIL could not open: ' + e.message.split('\n').slice(0, 8).join(' ~ ') }); await softReset(page); return; }
  if (!(await rootVisible(page, s.root))) { rows.push({ surface: s.id, vp, control: '-', path: 'open', result: 'FAIL opener did not open ' + s.root }); await softReset(page); return; }
  const controls = s.noControls ? [] : await discover(page, s.root);
  const plan = [];
  for (const c of controls) { plan.push({ control: c.label, path: mobile ? 'tap' : 'click', c }); if (!mobile) plan.push({ control: c.label, path: 'key', c }); }
  plan.push({ control: 'Escape', path: 'escape' });
  if (s.modal) plan.push({ control: 'scrim', path: mobile ? 'scrim-tap' : 'scrim-click' });
  else if (s.outside !== false) plan.push({ control: 'outside', path: mobile ? 'outside-tap' : 'outside-click' });
  await softReset(page);
  for (const p of plan) {
    const problems = [];
    await softReset(page);
    try { await doOpen(page, s, mobile); } catch (e) { record(p.control, p.path, ['could not open: ' + e.message.split('\n').slice(0, 8).join(' ~ ')]); continue; }
    const beforeText = await page.evaluate((root) => { const r = document.querySelector(root); return r ? r.innerText : ''; }, s.root);
    let original = null;
    if (s.draft) {
      original = await page.evaluate((sel) => { const i = document.querySelector(sel); return i ? i.value : null; }, s.draft.sel);
      const inp = page.locator(s.draft.sel).first();
      await inp.fill(s.draft.text).catch(() => {});
      await wait(250);
      if (p.path === 'escape') await inp.focus().catch(() => {});
    }
    try {
      if (p.c) {
        const fresh = await discover(page, s.root);
        const hit = fresh.find((f) => f.label === p.c.label);
        if (!hit) { record(p.control, p.path, ['control vanished']); continue; }
        const loc = page.locator(`[data-sweep="${hit.n}"]`).first();
        if (p.path === 'key') { await loc.focus(); await page.keyboard.press('Enter'); }
        else await press(page, loc, mobile);
      } else if (p.path === 'escape') await page.keyboard.press('Escape');
      else if (p.control === 'scrim') {
        const pt = await scrimPoint(page, s.root);
        if (!pt || pt === 'covered') { rows.push({ surface: s.id, vp, control: p.control, path: p.path, result: 'n/a no exposed scrim area' }); continue; }
        if (mobile) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
      } else {
        const vw = page.viewportSize();
        const pts = [[vw.width - 6, vw.height - 6], [vw.width - 6, 6], [vw.width / 2, vw.height - 6]];
        for (const [x, y] of pts) { if (!(await rootVisible(page, s.root))) break; const inside = await page.evaluate(({ x, y, root }) => { const el = document.elementFromPoint(x, y); return !!(el && el.closest(root)); }, { x, y, root: s.root }); if (inside) continue; if (mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); await wait(250); }
      }
    } catch (e) { record(p.control, p.path, ['action failed: ' + e.message.split('\n')[0]]); continue; }
    await wait(500);
    if (p.c && (s.navigates || []).includes(p.c.label)) {
      const stillOpen = await rootVisible(page, s.root);
      const changed = stillOpen && (await page.evaluate(([root]) => document.querySelector(root).innerText, [s.root])) !== beforeText;
      record(p.control, p.path, stillOpen && changed ? [] : ['navigation did not change the view']);
      continue;
    }
    if (await rootVisible(page, s.root)) problems.push('stays open');
    const left = (await overlays(page)).filter((o) => !base.includes(o) && !(s.keep || []).some((k) => o.startsWith(k)));
    if (left.length) problems.push('backdrop left: ' + [...new Set(left)].slice(0, 3).join(','));
    const railClosed = mobile && s.focus && await page.evaluate((sel) => !window.stateSignals.mobileMenuOpen.value && !!document.querySelector(sel)?.closest('.ca-rail'), s.focus).catch(() => false);
    const equivalent = mobile && s.focus ? await page.locator(s.focus).first().evaluate((o) => (o.closest('[inert]') || !o.getClientRects().length ? (o.closest('.ds-g3-mem') ? '.ds-g3-ibtn[aria-label="Member List"]' : '.ds-g3-burger') : null)).catch(() => null) : null;
    const openerAbsent = mobile && s.mobileFocus && !(await page.locator(s.focus).count());
    const focusTarget = openerAbsent ? s.mobileFocus : (equivalent || s.focus);
    if (s.focus && !railClosed && !/^outside/.test(p.path) && !(await focusOk(page, focusTarget))) problems.push('focus not returned');
    if (s.draft) {
      await softReset(page);
      try { await doOpen(page, s, mobile); const now = await page.evaluate((sel) => { const i = document.querySelector(sel); return i ? i.value : null; }, s.draft.sel); if (now !== original) problems.push('draft kept: ' + JSON.stringify(now)); } catch {}
    }
    record(p.control, p.path, problems);
  }
  await softReset(page);
}

const WORKERS = Number(process.env.SWEEP_WORKERS || 3);
const rig = await startRig();
const rows = [];
let browser;
const finish = async (code) => { try { await browser?.close(); } catch {} try { rig.dev.kill(); } catch {} try { rig.relay.close?.(); } catch {} process.exit(code); };
try {
  browser = await chromium.launch(launchOptions);
  const todo = SURFACES.filter((s) => !only || only.test(s.id));
  const jobs = [];
  for (const vpName of viewportsWanted) {
    const mobile = vpName === 'mobile';
    for (let w = 0; w < WORKERS; w++) {
      const mine = todo.filter((_, i) => i % WORKERS === w);
      if (!mine.length) continue;
      jobs.push((async () => {
        const page = await bootPage(browser, rig, mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, mobile);
        await softReset(page);
        const base = await overlays(page);
        for (const s of mine) { if (s.vp && s.vp !== vpName) continue; await runSurface(page, s, mobile, rows, base); }
        if (page.errs.length) rows.push({ surface: 'page', vp: vpName, control: '-', path: 'pageerror', result: 'FAIL ' + page.errs.slice(0, 2).join(' | ') });
      })());
    }
  }
  await Promise.all(jobs);
  const order = new Map(SURFACES.map((s, i) => [s.id, i]));
  rows.sort((a, b) => (order.get(a.surface) ?? 99) - (order.get(b.surface) ?? 99) || (a.vp < b.vp ? 1 : a.vp > b.vp ? -1 : 0));
} catch (e) { rows.push({ surface: 'sweep', vp: '-', control: '-', path: 'run', result: 'FAIL ' + e.message.split('\n')[0] }); }
const w = (k) => Math.max(k.length, ...rows.map((r) => String(r[k]).length));
const cols = ['surface', 'vp', 'control', 'path', 'result'];
const widths = Object.fromEntries(cols.map((k) => [k, w(k)]));
const line = (r) => cols.map((k) => String(r[k]).padEnd(widths[k])).join('  ');
console.log(line(Object.fromEntries(cols.map((k) => [k, k]))));
for (const r of rows) console.log(line(r));
const bad = rows.filter((r) => r.result.startsWith('FAIL'));
console.log(bad.length ? 'SWEEP_FAIL ' + bad.length + ' of ' + rows.length : 'SWEEP_OK ' + rows.length);
await finish(bad.length ? 1 : 0);
