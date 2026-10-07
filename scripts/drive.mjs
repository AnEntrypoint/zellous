#!/usr/bin/env node
// Run a page-context script against the live app and print whatever it evaluates to.
// The fast path for "what does this actually look like in the browser right now".
//
//   node scripts/drive.mjs probe.js [--local] [--viewport 1280x800] [--shot name]
//   node scripts/drive.mjs --expr "document.title"
//
// The script file is a module body: it may be async and may `return` a value.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1] ?? true) : d;
};
const has = (n) => args.includes(`--${n}`);

const file = args.find((a) => !a.startsWith('--'));
const expr = typeof flag('expr') === 'string' ? flag('expr') : null;
if (!file && !expr) {
  console.error('usage: node scripts/drive.mjs <script.js> | --expr "<js>" [--local] [--viewport WxH] [--shot name] [--ready false] [--timeout ms]');
  process.exit(2);
}

const PORT = Number(flag('port', 5201));
const LOCAL = has('local') || process.env.ZELLOUS_LOCAL_DEPS === '1';
const [W, H] = String(flag('viewport', '1280x800')).split('x').map(Number);
const SHOT = typeof flag('shot') === 'string' ? flag('shot') : null;
const WAIT_READY = !has('no-ready');
const TIMEOUT = Number(flag('timeout', 20000));
const OUT = path.resolve('.gm/witness');
const STORAGE = typeof flag('storage') === 'string' ? flag('storage') : null;

const raw = expr ?? fs.readFileSync(file, 'utf8');
const body = `(async () => {\n${raw}\n})()`;

const server = spawn(process.execPath, [path.resolve('scripts/dev-server.mjs'), 'docs', String(PORT)], {
  env: { ...process.env, ZELLOUS_LOCAL_DEPS: LOCAL ? '1' : '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
const stop = (c) => {
  server.kill('SIGKILL');
  process.exit(c);
};

async function up() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  console.error('server never came up:\n' + serverLog);
  stop(1);
}

async function main() {
  await up();
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
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

  const url = `http://127.0.0.1:${PORT}/${String(flag('path', LOCAL ? 'nostr-chat/?local=1' : 'nostr-chat/'))}`;
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
  console.log(JSON.stringify({ result, errors }, null, 2));
  stop(errors.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  stop(1);
});
