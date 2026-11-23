import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const launchOptions = { headless: true, args: ['--no-sandbox'], ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {}) };
const browser = await chromium.launch(launchOptions);
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('https://anentrypoint.github.io/zellous/nostr-chat/?cb=' + Date.now());
let ready = false;
try { await page.waitForFunction(() => window.appReady === true, null, { timeout: 45000 }); ready = true; } catch {}
const info = ready ? await page.evaluate(() => ({ modules: window.zModules.moduleList().length, composer: !!document.querySelector('.ds-g3-comp textarea') || !!document.querySelector('.ds-g3-header') })) : null;
await browser.close();
console.log('LIVE', JSON.stringify({ ready, info, errs: errs.slice(0, 3) }));
process.exit(ready && info && info.modules > 0 && !errs.length ? 0 : 1);
