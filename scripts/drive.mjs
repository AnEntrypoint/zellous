#!/usr/bin/env node
// Run a page-context script against the live app and print whatever it evaluates to.
// The fast path for "what does this actually look like in the browser right now".
//
//   node scripts/drive.mjs probe.js [--local] [--viewport 1280x800] [--shot name]
//   node scripts/drive.mjs --expr "return document.title"
//   node scripts/drive.mjs --url https://example.org/ --no-ready --expr "return document.title"
//
// The script body is wrapped in an async function: it may await, and it must
// `return` its value (a bare trailing expression is discarded).

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

const VALUE_FLAGS = new Set(['port', 'path', 'url', 'viewport', 'shot', 'timeout', 'settle', 'storage', 'storage-out', 'expr']);
const positional = args.filter(
  (a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && VALUE_FLAGS.has(args[i - 1].slice(2)))
);
const file = positional[0];
const expr = typeof flag('expr') === 'string' ? flag('expr') : null;
const USAGE =
  'usage: node scripts/drive.mjs <script.js> | --expr "<js, must return a value>"\n' +
  '  [--url <absolute http(s) URL>]  drive an external page instead of the local app; no dev server, --local/--path ignored\n' +
  '  [--path <app path>]             app path under the dev server (default nostr-chat/)\n' +
  '  [--local]                       serve the sibling design/wireweave checkouts\n' +
  '  [--port N] [--viewport WxH] [--shot name] [--timeout ms] [--settle ms]\n' +
  '  [--no-ready]                    skip waiting for window.appReady (default for --url unless --wait-ready)\n' +
  '  [--wait-ready]                  wait for window.appReady even with --url\n' +
  '  [--fake-media]                  launch Chromium with a fake camera/microphone and auto-accepted media prompts\n' +
  '  [--no-fake-media]               explicit default: real (absent) media devices, prompts as Chromium decides\n' +
  '  [--storage file] [--storage-out file]';
if (has('url') && typeof flag('url') !== 'string') {
  console.error('--url needs a value\n' + USAGE);
  process.exit(2);
}
if (!file && !expr) {
  console.error(USAGE);
  process.exit(2);
}

const URL_OVERRIDE = typeof flag('url') === 'string' ? flag('url') : null;
if (URL_OVERRIDE !== null) {
  let parsed = null;
  try {
    parsed = new URL(URL_OVERRIDE);
  } catch {}
  if (!parsed || !/^https?:$/.test(parsed.protocol)) {
    console.error(`--url must be an absolute http(s) URL, got: ${URL_OVERRIDE}`);
    process.exit(2);
  }
}

const PORT = Number(flag('port', 5201));
const LOCAL = has('local') || process.env.ZELLOUS_LOCAL_DEPS === '1';
const [W, H] = String(flag('viewport', '1280x800')).split('x').map(Number);
const SHOT = typeof flag('shot') === 'string' ? flag('shot') : null;
// The app's appReady flag does not exist on an arbitrary page, so --url waits only on request.
const WAIT_READY = has('wait-ready') || (URL_OVERRIDE === null && !has('no-ready'));
const TIMEOUT = Number(flag('timeout', 20000));
const OUT = path.resolve('.gm/witness');
const STORAGE = typeof flag('storage') === 'string' ? flag('storage') : null;
const FAKE_MEDIA = has('fake-media') && !has('no-fake-media');
const CHROME_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  ...(FAKE_MEDIA ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : []),
];

const raw = expr ?? fs.readFileSync(file, 'utf8');
const body = `(async () => {\n${raw}\n})()`;

const server = URL_OVERRIDE === null ? startDevServer({ port: PORT, local: LOCAL }) : null;
const stop = (code) => (server ? server.stop(code) : process.exit(code));

async function main() {
  if (server) await server.up();
  const browser = await chromium.launch({ args: CHROME_ARGS });
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  if (STORAGE && fs.existsSync(STORAGE)) {
    await ctx.addInitScript(
      `for (const [k,v] of Object.entries(${JSON.stringify(JSON.parse(fs.readFileSync(STORAGE, 'utf8')))})) { try { localStorage.setItem(k, v); } catch(e){} }`
    );
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => {
    if (!/fonts\.g|favicon/.test(r.url())) errors.push(`${r.failure()?.errorText} ${r.url()}`);
  });

  const url = URL_OVERRIDE ?? `http://127.0.0.1:${PORT}/${String(flag('path', LOCAL ? 'nostr-chat/?local=1' : 'nostr-chat/'))}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  if (WAIT_READY) await page.waitForFunction('window.appReady === true', { timeout: TIMEOUT });
  await page.waitForTimeout(Number(flag('settle', 800)));

  let result;
  try {
    result = await page.evaluate(body);
  } catch (e) {
    result = { __evalError: e.message };
  }

  if (SHOT) {
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, `${SHOT}.png`) });
  }
  if (has('storage-out')) {
    const store = await page.evaluate(() => {
      const o = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        o[k] = localStorage.getItem(k);
      }
      return o;
    });
    fs.writeFileSync(String(flag('storage-out')), JSON.stringify(store));
  }

  await browser.close();
  console.log(JSON.stringify({ url, fakeMedia: FAKE_MEDIA, result, errors }, null, 2));
  stop(errors.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  stop(1);
});
