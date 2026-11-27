import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RULES, ALIAS, IGNORE, TAG_KEYED, MASK, PURPOSE, PROPS } from './parity-keys.mjs';
import { collect, maskAndRects, quiet, unmask } from './parity-collect.mjs';
import { makeRef } from './parity-ref.mjs';
import { startRig, bootZel, wait } from './parity-zel.mjs';
import { SCREENS } from './parity-screens.mjs';

const root = new URL('../..', import.meta.url).pathname;
const require = createRequire(root + 'package.json');
const { chromium } = require('playwright');
const launchOptions = { headless: true, args: ['--no-sandbox'], ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {}) };
const outDir = process.env.PARITY_OUT || join(tmpdir(), 'zellous-parity');
const baselinePath = new URL('./parity.baseline.json', import.meta.url).pathname;
const only = process.env.PARITY_ONLY ? new RegExp(process.env.PARITY_ONLY, 'i') : null;
const vpsWanted = (process.env.PARITY_VP || 'desktop,mobile').split(',');
const PIXEL_THRESHOLD = 24;
const PX_TOL = 0.51;
const PIXEL_SLACK = 0.05;
const PROPS_SLACK = 3;
mkdirSync(join(outDir, 'shots'), { recursive: true });

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

const refHtml = (html) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{--spawn-chrome-reservation-right-inset:0px}html,body{margin:0;overflow:hidden;background:rgb(15,15,15)}body{font-family:"gg sans","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:rgb(250,250,250)}</style></head><body><div id="tome-ui-container" style="position:absolute;inset:0;overflow:clip">${html}</div></body></html>`;

async function press(page, selector, mobile) {
  const loc = page.locator(selector + ':visible').first();
  const box = await loc.evaluate((e) => { e.scrollIntoView({ block: 'center', inline: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, null, { timeout: 4000 });
  await wait(60);
  if (mobile) await page.touchscreen.tap(box.x, box.y); else await page.mouse.click(box.x, box.y);
}

async function runStep(page, st, mobile) {
  if (st.rail && mobile) { await page.evaluate(() => { window.stateSignals.mobileMenuOpen.value = true; }); await wait(350); }
  if (st.click) await press(page, st.click, mobile);
  else if (st.rightClick) {
    const box = await page.locator(st.rightClick + ':visible').first().evaluate((e) => { e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await page.mouse.click(box.x, box.y, { button: 'right' });
  } else if (st.hover) {
    const box = await page.locator(st.hover + ':visible').last().evaluate((e) => { e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await page.mouse.move(box.x, box.y);
  } else if (st.focus) await page.locator(st.focus + ':visible').first().focus();
  else if (st.fill) await page.locator(st.fill[0] + ':visible').first().fill(st.fill[1]);
  else if (st.key) await page.keyboard.press(st.key);
  else if (st.js) await page.evaluate((js) => { eval(js); }, st.js);
  else if (st.signal) await page.evaluate(([k, v]) => { window.stateSignals[k].value = v; }, st.signal);
  else if (st.pane) {
    if (st.optional && !(await page.locator('.ds-g3-set:visible').count())) return;
    if (mobile) await page.locator('.ds-g3-set select[aria-label="settings section"]').selectOption({ label: st.pane });
    else await press(page, `.ds-g3-set p:text-is("${st.pane}")`, false);
  }
  await wait(st.wait || 380);
}

async function zelReset(page, sid, mobile) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('.ds-g3-sres-clear:visible').first().click({ timeout: 300 }).catch(() => {});
  await page.evaluate(() => {
    const ta = document.querySelector('.ds-g3-comp textarea');
    if (ta && ta.value) { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, ''); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    const sp = document.querySelector('.ds-g3-splitsel');
    if (sp && sp.value) { sp.value = ''; sp.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  for (let i = 0; i < 8 && await page.locator('.ds-g3-vbar:visible').count(); i++) {
    await page.locator('.ds-g3-vbar button:last-child, .ds-g3-vbar [title*="isconnect"]').first().click({ timeout: 500 }).catch(() => {});
    await wait(350);
  }
  await wait(200);
  await page.evaluate(async (sid) => {
    const S = window.stateSignals;
    if (S.gameSurface) S.gameSurface.value = null;
    for (const k of ['gamePrefOpen', 'gameServerCreateOpen', 'voiceSettingsOpen', 'settingsOpen', 'showAuthModal', 'threadPanelOpen', 'mobileMenuOpen', 'setupOpen', 'memberListOpen']) if (S[k]) S[k].value = false;
    document.querySelectorAll('.modal-overlay.open').forEach((m) => m.remove());
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (window.state.homeMode || window.state.currentServerId !== sid) await window.serverManager.switchTo(sid);
    const g = window.state.channels.find((x) => x.name === 'general');
    if (g && window.state.currentChannel?.id !== g.id) window.ui.actions.switchChannel(g);
  }, sid);
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.move(mobile ? 389 : 1439, mobile ? 843 : 899);
  await wait(350);
}

const TEXT_PROPS = new Set(['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'textAlign', 'textTransform', 'textDecorationLine']);
const BORDER_COLOR = new Set(['borderTopColor']);
const NO_BORDER_PX = (e) => pxNum(e.st.borderTopWidth) === 0;
const invisibleProp = (p, r, z) => {
  if (TEXT_PROPS.has(p) && !r.leaf && !z.leaf && !r.text && !z.text) return true;
  if (TEXT_PROPS.has(p) && r.tag === 'img' && z.tag === 'img') return true;
  if (BORDER_COLOR.has(p) && NO_BORDER_PX(r) && NO_BORDER_PX(z)) return true;
  if (p === 'position' && [r.st.position, z.st.position].every((v) => v === 'static' || v === 'relative')) return true;
  return false;
};
function lcsPair(R, Z) {
  const n = R.length, m = Z.length;
  const eq = (i, j) => R[i].text && R[i].text === Z[j].text;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = eq(i, j) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const pairs = []; const missing = []; const extra = [];
  let i = 0, j = 0; let gi = 0, gj = 0;
  const flush = (ei, ej) => {
    const rs = [], zs = [];
    for (let a = gi; a < ei; a++) rs.push(a);
    for (let b = gj; b < ej; b++) zs.push(b);
    const k = Math.min(rs.length, zs.length);
    for (let t = 0; t < k; t++) pairs.push([rs[t], zs[t]]);
    for (let t = k; t < rs.length; t++) missing.push(rs[t]);
    for (let t = k; t < zs.length; t++) extra.push(zs[t]);
  };
  while (i < n && j < m) {
    if (eq(i, j) && L[i][j] === L[i + 1][j + 1] + 1) { flush(i, j); pairs.push([i, j]); i++; j++; gi = i; gj = j; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  flush(n, m);
  return { pairs, missing, extra };
}

const pxNum = (v) => { const m = /^(-?[\d.]+)px$/.exec(String(v)); return m ? parseFloat(m[1]) : null; };
const zeroGap = (v) => v === 'normal' || /^0(px)?( 0(px)?)?$/.test(String(v)) || v === 'normal normal';
const srgb = (v) => { const m = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(String(v)); if (!m) return v; const c = [m[1], m[2], m[3]].map((x) => Math.round(parseFloat(x) * 255)); return m[4] !== undefined && parseFloat(m[4]) < 1 ? `rgba(${c.join(', ')}, ${+parseFloat(m[4]).toFixed(2)})` : `rgb(${c.join(', ')})`; };
function valuesDiffer(prop, a, b) {
  if (prop === 'gap' && zeroGap(a) && zeroGap(b)) return false;
  a = srgb(a); b = srgb(b);
  if (a === b) return false;
  const na = pxNum(a), nb = pxNum(b);
  if (na !== null && nb !== null) return Math.abs(na - nb) > PX_TOL;
  if (prop === 'opacity') return Math.abs(parseFloat(a) - parseFloat(b)) > 0.02;
  if (prop === 'lineHeight' || prop === 'letterSpacing') { if (a === 'normal' || b === 'normal') return a !== b && !(a === 'normal' && nb !== null) && !(b === 'normal' && na !== null) ? true : false; }
  return true;
}

function compare(R, Z) {
  const refKeys = new Map(), zelKeys = new Map();
  R.forEach((e, i) => { if (!refKeys.has(e.key)) refKeys.set(e.key, []); refKeys.get(e.key).push(i); });
  Z.forEach((e, i) => { if (!zelKeys.has(e.key)) zelKeys.set(e.key, []); zelKeys.get(e.key).push(i); });
  const keys = new Set([...refKeys.keys(), ...zelKeys.keys()]);
  const pairs = []; const missing = []; const extra = []; const excluded = {};
  for (const k of keys) {
    const vis = (L) => (a, b) => (Math.round(L[a].y / 3) - Math.round(L[b].y / 3)) || (L[a].x - L[b].x);
    const ri = (refKeys.get(k) || []).slice().sort(vis(R)), zi = (zelKeys.get(k) || []).slice().sort(vis(Z));
    const rl = ri.filter((i) => !R[i].purpose), zl = zi.filter((i) => !Z[i].purpose);
    for (const i of ri.filter((i) => R[i].purpose)) excluded[R[i].purpose] = (excluded[R[i].purpose] || 0) + 1;
    for (const i of zi.filter((i) => Z[i].purpose)) excluded[Z[i].purpose] = (excluded[Z[i].purpose] || 0) + 1;
    const res = lcsPair(rl.map((i) => R[i]), zl.map((i) => Z[i]));
    for (const [a, b] of res.pairs) pairs.push([rl[a], zl[b]]);
    for (const a of res.missing) missing.push(rl[a]);
    for (const b of res.extra) extra.push(zl[b]);
  }
  const mapR = new Map(pairs.map(([a, b]) => [a, b]));
  const diffs = [];
  for (const [a, b] of pairs) {
    const r = R[a], z = Z[b];
    const area = Math.max(r.w * r.h, z.w * z.h);
    const push = (prop, rv, zv) => diffs.push({ key: r.key, sel: r.sel, zsel: z.sel, prop, ref: rv, zel: zv, area });
    for (const p of PROPS) {
      if (invisibleProp(p, r, z)) continue;
      if (p === 'fontFamily' || valuesDiffer(p, r.st[p], z.st[p])) {
        if (p === 'fontFamily' ? r.st[p] !== z.st[p] : true) push(p, r.st[p], z.st[p]);
      }
    }
    if (Math.abs(r.w - z.w) > PX_TOL) push('width', r.w.toFixed(1) + 'px', z.w.toFixed(1) + 'px');
    if (Math.abs(r.h - z.h) > PX_TOL) push('height', r.h.toFixed(1) + 'px', z.h.toFixed(1) + 'px');
    if (r.text && z.text && r.text !== z.text) push('text', r.text, z.text);
    const pa = r.parent, pb = z.parent;
    if (pa >= 0 && pb >= 0 && mapR.get(pa) === pb) {
      const dx = (r.x - R[pa].x) - (z.x - Z[pb].x), dy = (r.y - R[pa].y) - (z.y - Z[pb].y);
      if (Math.abs(dx) > 1) push('offsetX', (r.x - R[pa].x).toFixed(1) + 'px', (z.x - Z[pb].x).toFixed(1) + 'px');
      if (Math.abs(dy) > 1) push('offsetY', (r.y - R[pa].y).toFixed(1) + 'px', (z.y - Z[pb].y).toFixed(1) + 'px');
    }
  }
  for (const a of missing) diffs.push({ key: R[a].key, sel: R[a].sel, zsel: '-', prop: 'missing in zellous', ref: R[a].text || R[a].sel, zel: '-', area: R[a].w * R[a].h });
  for (const b of extra) diffs.push({ key: Z[b].key, sel: '-', zsel: Z[b].sel, prop: 'extra in zellous', ref: '-', zel: Z[b].text || Z[b].sel, area: Z[b].w * Z[b].h });
  return { diffs, paired: pairs.length, missing: missing.length, extra: extra.length, excluded };
}

async function pixelDiff(diffPage, a, b, outPath) {
  return diffPage.evaluate(async ({ a, b, thr }) => {
    const load = async (s) => { const blob = await (await fetch('data:image/png;base64,' + s)).blob(); return createImageBitmap(blob); };
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
    const data = (img) => { const c = new OffscreenCanvas(w, h); const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
    const A = data(ia), B = data(ib);
    const out = new OffscreenCanvas(w * 3, h); const og = out.getContext('2d');
    og.drawImage(ia, 0, 0); og.drawImage(ib, w, 0);
    const mask = og.createImageData(w, h);
    const dist = (X, Y, i, j) => Math.max(Math.abs(X[i] - Y[j]), Math.abs(X[i + 1] - Y[j + 1]), Math.abs(X[i + 2] - Y[j + 2]));
    let count = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let diff = dist(A, B, i, i) >= thr;
      if (diff) {
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = (yy * w + xx) * 4;
          if (dist(A, B, i, j) < thr || dist(A, B, j, i) < thr) { near = true; break; }
        }
        diff = !near;
      }
      if (diff) { count++; mask.data[i] = 255; mask.data[i + 1] = 40; mask.data[i + 2] = 40; mask.data[i + 3] = 255; }
      else { mask.data[i] = A[i] >> 2; mask.data[i + 1] = A[i + 1] >> 2; mask.data[i + 2] = A[i + 2] >> 2; mask.data[i + 3] = 255; }
    }
    og.putImageData(mask, w * 2, 0);
    const blob = await out.convertToBlob({ type: 'image/png' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (let k = 0; k < buf.length; k += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(k, k + 0x8000));
    return { pct: (count / (w * h)) * 100, png: btoa(bin) };
  }, { a, b, thr: PIXEL_THRESHOLD });
}

const side = (s) => ({ side: s, rules: RULES[s], alias: s === 'zel' ? ALIAS : {}, ignore: IGNORE, tagKeyed: TAG_KEYED, props: PROPS, purpose: PURPOSE });

async function measureScreen(env, screen, vpName) {
  const { refPage, zelPage, diffPage, sid, mobile } = env;
  const r = makeRef();
  screen.ref?.(r, { mobile });
  await refPage.setContent(refHtml(r.render()), { waitUntil: 'load' });
  if (screen.refSteps) for (const st of screen.refSteps) await runStep(refPage, st, mobile);
  await zelReset(zelPage, sid, mobile);
  if (screen.zel) for (const st of screen.zel) await runStep(zelPage, st, mobile);
  await Promise.all([refPage, zelPage].map((pg) => pg.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 2500); })))]))));
  await wait(450);
  await Promise.all([refPage.evaluate(quiet), zelPage.evaluate(quiet)]);
  const [R, Z] = await Promise.all([refPage.evaluate(collect, side('ref')), zelPage.evaluate(collect, side('zel'))]);
  if (process.env.PARITY_DEBUG) { const c = (L) => L.reduce((m, e) => (m[e.key] = (m[e.key] || 0) + 1, m), {}); console.log('REF', JSON.stringify(c(R))); console.log('ZEL', JSON.stringify(c(Z))); }
  if (process.env.PARITY_DUMP) { const f = (L) => L.map((e) => `${e.key} ${e.sel} ${Math.round(e.x)},${Math.round(e.y)} ${Math.round(e.w)}x${Math.round(e.h)} ${e.text}`).join('\n'); writeFileSync(join(outDir, screen.id.replace(/[^a-z0-9]+/gi, '_') + '.' + vpName + '.dump.txt'), 'REF\n' + f(R) + '\nZEL\n' + f(Z) + '\n'); }
  const cmp = compare(R, Z);
  const purposeRects = [...R.filter((e) => e.purpose), ...Z.filter((e) => e.purpose)].map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h }));
  await Promise.all([
    refPage.evaluate(maskAndRects, { selectors: MASK.ref, rects: purposeRects }),
    zelPage.evaluate(maskAndRects, { selectors: MASK.zel, rects: purposeRects }),
  ]);
  const vp = VIEWPORTS[vpName];
  const [ra, za] = await Promise.all([refPage.screenshot({ clip: { x: 0, y: 0, width: vp.width, height: vp.height } }), zelPage.screenshot({ clip: { x: 0, y: 0, width: vp.width, height: vp.height } })]);
  const px = await pixelDiff(diffPage, ra.toString('base64'), za.toString('base64'));
  const shot = join(outDir, 'shots', screen.id.replace(/[^a-z0-9]+/gi, '_') + '.' + vpName + '.png');
  writeFileSync(shot, Buffer.from(px.png, 'base64'));
  await zelPage.evaluate(unmask);
  return { id: screen.id, vp: vpName, pixel: px.pct, props: cmp.diffs.length, missing: cmp.missing, extra: cmp.extra, paired: cmp.paired, excluded: cmp.excluded, diffs: cmp.diffs, refCount: R.length, zelCount: Z.length, shot };
}

function topOf(diffs, n = 3) {
  const seen = new Set(); const out = [];
  for (const d of [...diffs].sort((a, b) => b.area - a.area)) {
    const k = d.key + '.' + d.prop; if (seen.has(k)) continue; seen.add(k);
    out.push(d.prop.endsWith('zellous') ? `${d.key} ${d.prop}` : `${d.key}.${d.prop} ${String(d.ref).slice(0, 18)}>${String(d.zel).slice(0, 18)}`);
    if (out.length >= n) break;
  }
  return out.join('; ');
}

async function runViewport(browser, rig, vpName, screens) {
  const mobile = vpName === 'mobile';
  const vp = VIEWPORTS[vpName];
  const { page: zelPage, sid } = await bootZel(browser, rig, vp, mobile);
  const rctx = await browser.newContext({ viewport: vp, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' });
  const refPage = await rctx.newPage();
  refPage.errs = []; refPage.on('pageerror', (e) => refPage.errs.push(e.message));
  const diffPage = await (await browser.newContext()).newPage();
  const env = { refPage, zelPage, diffPage, sid, mobile };
  const results = [];
  for (const s of screens) {
    if (s.vp && s.vp !== vpName) continue;
    try { results.push(await measureScreen(env, s, vpName)); }
    catch (e) { results.push({ id: s.id, vp: vpName, error: e.message.split('\n')[0] }); }
  }
  if (zelPage.errs.length) results.push({ id: '(page errors)', vp: vpName, error: zelPage.errs.slice(0, 2).join(' | ') });
  return results;
}

const started = Date.now();
const rig = await startRig();
let browser; let exit = 0;
const rows = [];
try {
  browser = await chromium.launch(launchOptions);
  const todo = SCREENS.filter((s) => !only || only.test(s.id));
  const all = await Promise.all(vpsWanted.map((v) => runViewport(browser, rig, v, todo)));
  for (const r of all.flat()) rows.push(r);
} catch (e) { rows.push({ id: '(run)', vp: '-', error: e.message.split('\n')[0] }); }
finally { try { await browser?.close(); } catch {} rig.stop(); }

const order = new Map(SCREENS.map((s, i) => [s.id, i]));
rows.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) || (a.vp < b.vp ? 1 : -1));
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : {};
const update = process.env.PARITY_UPDATE === '1';
const next = {};
const lines = []; const md = ['| screen | viewport | pixel diff % | differing props | missing/extra | top differences |', '|---|---|---|---|---|---|'];
let totalPx = 0, totalProps = 0, counted = 0; const excludedTotal = {}; const failures = [];
for (const r of rows) {
  if (r.error) { lines.push(`${r.id.padEnd(28)} ${r.vp.padEnd(8)} ERROR ${r.error}`); failures.push(r.id + '@' + r.vp + ' error'); continue; }
  const key = r.id + '@' + r.vp;
  const b = baseline[key];
  next[key] = { pixel: Math.round(r.pixel * 100) / 100, props: r.props };
  let verdict = 'new';
  if (b) verdict = r.pixel > b.pixel + PIXEL_SLACK || r.props > b.props + PROPS_SLACK ? 'WORSE' : 'ok';
  if (verdict === 'WORSE') failures.push(key + ` px ${r.pixel.toFixed(2)}>${b.pixel} props ${r.props}>${b.props}`);
  totalPx += r.pixel; totalProps += r.props; counted++;
  for (const [k, v] of Object.entries(r.excluded)) excludedTotal[k] = (excludedTotal[k] || 0) + v;
  const top = topOf(r.diffs);
  lines.push(`${r.id.padEnd(28)} ${r.vp.padEnd(8)} px ${r.pixel.toFixed(2).padStart(6)}%  props ${String(r.props).padStart(4)}  miss/extra ${r.missing}/${r.extra}  ${verdict.padEnd(5)} ${top}`);
  md.push(`| ${r.id} | ${r.vp} | ${r.pixel.toFixed(2)} | ${r.props} | ${r.missing}/${r.extra} | ${top.replace(/\|/g, '/')} |`);
}
const summary = `TOTAL screens=${counted} mean pixel ${(counted ? totalPx / counted : 0).toFixed(2)}% props ${totalProps} excluded(on purpose)=${JSON.stringify(excludedTotal)} wall ${((Date.now() - started) / 1000).toFixed(1)}s`;
md.push('', summary);
writeFileSync(join(outDir, 'parity-table.md'), md.join('\n') + '\n');
writeFileSync(join(outDir, 'parity-diffs.json'), JSON.stringify(rows.map((r) => ({ id: r.id, vp: r.vp, pixel: r.pixel, props: r.props, diffs: r.diffs })), null, 1));
for (const l of lines) console.log(l);
console.log(summary);
if (update) { writeFileSync(baselinePath, JSON.stringify({ ...baseline, ...next }, null, 1) + '\n'); console.log('baseline written ' + baselinePath); }
if (failures.length && !update) { console.log('PARITY_FAIL ' + failures.length + '\n' + failures.join('\n')); exit = 1; } else console.log('PARITY_OK');
process.exit(exit);
