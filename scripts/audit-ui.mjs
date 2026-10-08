#!/usr/bin/env node
// Measures the live UI the way a user meets it and reports every measurable
// defect: contrast, touch-target size, occlusion, clipping, tiny type, missing
// accessible names, stray scroll. Not a test suite -- a measuring instrument.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startDevServer } from './lib/dev-server.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1] ?? true) : d;
};
const has = (n) => args.includes(`--${n}`);

const PORT = Number(flag('port', 5203));
const LOCAL = has('local') || process.env.ZELLOUS_LOCAL_DEPS === '1';
const STORAGE = typeof flag('storage') === 'string' ? flag('storage') : null;
const SCENES = (typeof flag('scenes') === 'string' ? flag('scenes') : 'boot').split(',');
const THEMES = (typeof flag('themes') === 'string' ? flag('themes') : 'ink').split(',');
const VIEWPORTS = (typeof flag('viewports') === 'string' ? flag('viewports') : '1280x800').split(',');
const MIN_CONTRAST = Number(flag('min-contrast', 4.5));
const MIN_TARGET = Number(flag('min-target', 40));
const OUT = path.resolve('.gm/witness');
const FAKE_MEDIA = has('fake-media') && !has('no-fake-media');
const CHROME_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  ...(FAKE_MEDIA ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : []),
];

const AUDIT = fs.readFileSync(path.resolve('scripts/audit-ui.pagescript.js'), 'utf8');

const { up, stop } = startDevServer({ port: PORT, local: LOCAL });

async function main() {
  await up();
  const browser = await chromium.launch({ args: CHROME_ARGS });
  const report = { runs: [], findings: 0, fakeMedia: FAKE_MEDIA };

  for (const vps of VIEWPORTS) {
    const [W, H] = vps.split('x').map(Number);
    for (const theme of THEMES) {
      const coarse = W <= 900;
      const ctx = await browser.newContext({
        viewport: { width: W, height: H },
        ...(coarse ? { hasTouch: true, isMobile: false } : {}),
      });
      if (STORAGE && fs.existsSync(STORAGE)) {
        const store = JSON.parse(fs.readFileSync(STORAGE, 'utf8'));
        store['zellous-theme'] = theme;
        store['247420:theme'] = theme === 'light' ? 'paper' : theme;
        await ctx.addInitScript(
          `for (const [k,v] of Object.entries(${JSON.stringify(store)})) { try { localStorage.setItem(k, v); } catch(e){} }`
        );
      }
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

      await page.goto(`http://127.0.0.1:${PORT}/nostr-chat/${LOCAL ? '?local=1' : ''}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.appReady === true', { timeout: 25000 });
      await page.waitForTimeout(1500);

      for (const scene of SCENES) {
        // Each scene gets a fresh load: overlays left open by one scene would
        // otherwise be measured again in the next and reported as defects.
        await page.goto(`http://127.0.0.1:${PORT}/nostr-chat/${LOCAL ? '?local=1' : ''}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction('window.appReady === true', { timeout: 25000 });
        await page.waitForTimeout(1200);
        if (scene !== 'boot') {
          try {
            await page.evaluate(`(async () => { ${fs.readFileSync(path.resolve(`scripts/scenes/${scene}.js`), 'utf8')} })()`);
          } catch (e) {
            errors.push(`scene ${scene}: ${e.message}`);
          }
          await page.waitForTimeout(900);
        }
        const findings = await page.evaluate(
          `(async () => { const OPTS = ${JSON.stringify({ minContrast: MIN_CONTRAST, minTarget: MIN_TARGET })};
            return (async () => { ${AUDIT} })();
          })()`
        );
        const noFocusRing = [];
        try {
          await page.evaluate(() => document.body.setAttribute('tabindex', '-1') || document.body.focus());
          for (let i = 0; i < 45; i++) {
            await page.keyboard.press('Tab');
            const info = await page.evaluate(() => {
              const el = document.activeElement;
              if (!el || el === document.body || el === document.documentElement) return null;
              const cs = getComputedStyle(el);
              const r = el.getBoundingClientRect();
              const cls = String(el.className || '').trim().split(/\s+/).slice(0, 2).join('.');
              // The composer, search boxes and rows draw the ring on the wrapper,
              // not the control: a ring on an ancestor is still a visible ring.
              let ringOn = null;
              for (let n = el.parentElement, d = 0; n && d < 4 && !ringOn; n = n.parentElement, d++) {
                const ns = getComputedStyle(n);
                if ((ns.outlineStyle !== 'none' && parseFloat(ns.outlineWidth) > 0) || (ns.boxShadow && ns.boxShadow !== 'none')) {
                  ringOn = n.tagName.toLowerCase() + (n.className ? '.' + String(n.className).trim().split(/\s+/)[0] : '');
                }
              }
              return {
                el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : ''),
                label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24),
                outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
                shadow: cs.boxShadow && cs.boxShadow !== 'none',
                borderChange: cs.borderColor !== 'transparent' && parseFloat(cs.borderWidth) > 0,
                ringOn,
                inView: r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1,
              };
            });
            if (!info) break;
            if (!info.outline && !info.shadow && !info.ringOn) noFocusRing.push(info);
          }
        } catch (e) {
          errors.push('focus walk: ' + e.message);
        }
        const n = Object.values(findings.counts || {}).reduce((a, b) => a + b, 0) + noFocusRing.length;
        report.findings += n;
        report.runs.push({ viewport: `${W}x${H}`, theme, scene, errors, counts: findings.counts, items: findings.items, noFocusRing });
      }
      await ctx.close();
    }
  }
  await browser.close();
  if (has('json')) console.log(JSON.stringify(report, null, 2));
  else {
    for (const r of report.runs) {
      console.log(`\n=== ${r.viewport} ${r.theme} ${r.scene} ===`);
      console.log('counts', JSON.stringify(r.counts));
      for (const [k, arr] of Object.entries(r.items)) {
        if (!arr?.length) continue;
        console.log(` ${k}:`);
        for (const it of arr.slice(0, 12)) console.log('   ', JSON.stringify(it));
        if (arr.length > 12) console.log(`    ... ${arr.length - 12} more`);
      }
      if (r.noFocusRing?.length) {
        console.log(' noFocusRing:');
        for (const it of r.noFocusRing.slice(0, 10)) console.log('   ', JSON.stringify(it));
      }
      if (r.errors.length) console.log(' errors', r.errors.slice(0, 6));
    }
    console.log(`\ntotal findings: ${report.findings}`);
  }
  stop(0);
}
main().catch((e) => {
  console.error(e);
  stop(1);
});
