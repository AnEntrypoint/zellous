// Real E2E: boots docs/ statically, drives a headless browser against the
// live nostr-chat app, generates a real keypair, connects to real public
// Nostr relays, and round-trips a real signed chat event through them.
// No mocks: relay-pool.js's default wss:// relays are used unmodified.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, 'docs');
const PORT = 5891;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.wasm': 'application/wasm',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      let f = path.normalize(path.join(ROOT, p));
      if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) { res.writeHead(404).end('404 ' + p); return; }
      const ext = path.extname(f);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(f));
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function main() {
  console.log('[test] starting static server on :' + PORT);
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  try {
    console.log('[test] navigating to /nostr-chat/');
    await page.goto(`http://127.0.0.1:${PORT}/nostr-chat/`, { waitUntil: 'networkidle', timeout: 30000 });

    console.log('[test] waiting for appReady');
    await page.waitForFunction('window.appReady === true', { timeout: 25000 });

    const globals = await page.evaluate(() => ({
      auth: typeof window.auth, network: typeof window.network, chat: typeof window.chat,
    }));
    console.log('[test] globals', globals);
    if (globals.auth !== 'object' || globals.network !== 'object') {
      throw new Error('expected window.auth/window.network to be wired, got ' + JSON.stringify(globals));
    }

    console.log('[test] generating real keypair + connecting to real relays');
    const connectResult = await page.evaluate(async () => {
      const key = window.auth.generateKey();
      window.auth.init();
      window.network.connect();
      const deadline = Date.now() + 15000;
      while (!window.network.isConnected() && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 250));
      }
      const relayStatuses = [...window.network.relays.entries()];
      return { pubkey: key.pubkey, connected: window.network.isConnected(), relayStatuses };
    });
    console.log('[test] connect result', connectResult);
    if (!connectResult.pubkey || connectResult.pubkey.length !== 64) {
      throw new Error('expected a real 64-char hex pubkey from generateKey(), got ' + connectResult.pubkey);
    }
    if (!connectResult.connected) {
      throw new Error('expected window.network.isConnected() true after connect(); relays=' + JSON.stringify(connectResult.relayStatuses));
    }

    console.log('[test] signing + publishing a real chat (kind 1) event, then subscribing for its echo');
    const chatResult = await page.evaluate(async () => {
      const marker = 'zellous-e2e-' + Math.random().toString(36).slice(2);
      const unsigned = { kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content: marker };
      const signed = await window.auth.sign(unsigned);
      if (!signed || !signed.id || !signed.sig) return { ok: false, reason: 'sign() did not return a signed event', signed };

      let received = null;
      const subId = 'e2e-' + marker;
      window.network.subscribe(subId, [{ kinds: [1], authors: [signed.pubkey], since: signed.created_at - 5 }], (evt) => {
        if (evt.content === marker) received = evt;
      });

      window.network.publish(signed);

      const deadline = Date.now() + 20000;
      while (!received && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 300));
      }
      window.network.unsubscribe(subId);
      return { ok: !!received, marker, publishedId: signed.id, received };
    });
    console.log('[test] chat round-trip result', { ok: chatResult.ok, marker: chatResult.marker, publishedId: chatResult.publishedId, receivedId: chatResult.received?.id });

    if (!chatResult.ok) {
      throw new Error('real chat message did not round-trip through any public relay within 20s: ' + JSON.stringify(chatResult));
    }
    if (chatResult.received.id !== chatResult.publishedId) {
      throw new Error('echoed event id does not match published id');
    }

    const relevantErrors = errors.filter((e) => !/fonts\.googleapis/.test(e));
    if (relevantErrors.length) {
      throw new Error('console/page errors during flow: ' + JSON.stringify(relevantErrors));
    }

    console.log('[test] PASS: boot -> appReady -> real key -> real relay connect -> real signed publish -> real relay echo, zero console errors');
    process.exitCode = 0;
  } catch (err) {
    console.error('[test] FAIL:', err.message);
    console.error('[test] collected page errors:', errors);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

main();
