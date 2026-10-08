#!/usr/bin/env node
// One-command browser witness. Boots the dev server, drives real Chromium, and
// reports console errors, failed requests and boot state -- the step of the
// validation loop that used to be hand-typed every time.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startDevServer } from './lib/dev-server.mjs';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? true) : dflt;
};
const has = (name) => args.includes(`--${name}`);

const PORT = Number(flag('port', 5199));
const PAGE_PATH = typeof flag('url') === 'string' ? flag('url') : '/nostr-chat/';
const LOCAL = has('local') || process.env.ZELLOUS_LOCAL_DEPS === '1';
const VIEWPORTS = (typeof flag('viewports') === 'string' ? flag('viewports') : '1280x800,375x667')
  .split(',')
  .map((s) => {
    const [w, h] = s.split('x').map(Number);
    return { width: w, height: h };
  });
const SHOTS = !has('no-shots');
const OUT = path.resolve('.gm/witness');
const TIMEOUT = Number(flag('timeout', 20000));

const { up: waitForServer, stop } = startDevServer({ port: PORT, local: LOCAL });

const IGNORE = [/fonts\.googleapis/, /fonts\.gstatic/, /favicon/i];

async function run() {
  await waitForServer();
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const report = { url: null, viewports: [], errors: [], failedRequests: [], boot: null };

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const errors = [];
    const failed = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => {
      const u = r.url();
      if (!IGNORE.some((re) => re.test(u))) failed.push(`${r.failure()?.errorText} ${u}`);
    });

    const base = `http://127.0.0.1:${PORT}`;
    const url = base + PAGE_PATH + (LOCAL ? (PAGE_PATH.includes('?') ? '&' : '?') + 'local=1' : '');
    report.url = url;

    let ready = false;
    let bootEvents = null;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
      await page.waitForFunction('window.appReady === true', { timeout: TIMEOUT });
      ready = true;
    } catch (e) {
      try {
        bootEvents = await page.evaluate(() => window.__boot?.events ?? null);
      } catch {}
    }

    let probe = null;
    try {
      probe = await page.evaluate(() => ({
        appReady: !!window.appReady,
        bodyScrollHeight: document.body.scrollHeight,
        innerHeight: window.innerHeight,
        overflowsBody: document.body.scrollHeight > window.innerHeight + 1,
        docScrollWidth: document.documentElement.scrollWidth,
        overflowsX: document.documentElement.scrollWidth > window.innerWidth + 1,
        zellousKeys: Object.keys(window.__zellous || {}).length,
        sdk: !!window.__sdk,
        chat: typeof window.chat,
        auth: typeof window.auth,
        lk: typeof window.lk,
        boot: document.getElementById('zellousBoot') ? 'still-present' : 'removed',
      }));
    } catch (e) {
      probe = { evalError: e.message };
    }

    const shot = path.join(OUT, `shot-${vp.width}x${vp.height}.png`);
    if (SHOTS) await page.screenshot({ path: shot, fullPage: false });

    report.viewports.push({ ...vp, ready, bootEvents, probe, errors, failed, shot: SHOTS ? shot : null });
    report.errors.push(...errors.map((e) => `${vp.width}x${vp.height}: ${e}`));
    report.failedRequests.push(...failed.map((f) => `${vp.width}x${vp.height}: ${f}`));
    report.boot ??= bootEvents;
    await ctx.close();
  }

  await browser.close();
  console.log(JSON.stringify(report, null, 2));
  const bad = report.errors.length || report.failedRequests.length || report.viewports.some((v) => !v.ready);
  stop(bad ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  stop(1);
});
