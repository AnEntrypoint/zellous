#!/usr/bin/env node
// Static dev server for docs/. Two things the validation loop needs and a plain
// `serve` does not: correct MIME types for ES modules, and a local-deps mode that
// repoints the jsdelivr importmap at the sibling design/wireweave checkouts so a
// change there is witnessed on the next reload instead of 12-24h later.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(process.argv[2] ?? 'docs');
const PORT = Number(process.env.PORT ?? process.argv[3] ?? 5175);

const CDN_DESIGN = 'https://cdn.jsdelivr.net/gh/AnEntrypoint/design@main/';
const CDN_WIREWEAVE = 'https://cdn.jsdelivr.net/gh/AnEntrypoint/wireweave@main/';

const SIBLINGS = path.dirname(path.dirname(path.resolve('.')));
// The CDN paths already carry the subdir (`design@main/dist/...`, `wireweave@main/src/...`),
// so the mount prefix maps to each repo root, not to its build dir.
const MOUNTS = [
  { prefix: '/deps/design/', dir: path.join(path.dirname(ROOT), '..', 'design') },
  { prefix: '/deps/wireweave/', dir: path.join(path.dirname(ROOT), '..', 'wireweave') },
].map((m) => ({ ...m, real: path.resolve(m.dir) }));

const LOCAL_DEFAULT = process.env.ZELLOUS_LOCAL_DEPS === '1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function mountFor(pathname) {
  for (const m of MOUNTS) if (pathname === m.prefix.slice(0, -1) || pathname.startsWith(m.prefix)) return m;
  return null;
}

function localize(html) {
  return html.split(CDN_DESIGN).join('/deps/design/').split(CDN_WIREWEAVE).join('/deps/wireweave/');
}

function send(res, code, body, headers = {}) {
  res.writeHead(code, {
    'Cache-Control': 'no-store, must-revalidate',
    'Pragma': 'no-cache',
    ...headers,
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname);
  } catch {
    return send(res, 400, 'bad request');
  }
  const query = url.parse(req.url, true).query;

  const mount = mountFor(pathname);
  let target;
  if (mount) {
    target = path.join(mount.real, pathname.slice(mount.prefix.length));
  } else {
    target = path.resolve(path.join(ROOT, pathname));
  }
  const inside = mount ? target.startsWith(mount.real) : target === ROOT || target.startsWith(ROOT + path.sep);
  if (!inside) return send(res, 403, 'forbidden');

  let stat;
  try {
    stat = await fsp.stat(target);
  } catch {
    console.warn(`[404] ${pathname}`);
    return send(res, 404, `404 ${pathname}`);
  }
  if (stat.isDirectory()) target = path.join(target, 'index.html');

  let body;
  try {
    body = await fsp.readFile(target);
  } catch {
    console.warn(`[404] ${pathname}`);
    return send(res, 404, `404 ${pathname}`);
  }

  const ext = path.extname(target).toLowerCase();
  const type = MIME[ext] ?? 'application/octet-stream';

  if (ext === '.html') {
    const wantLocal = query.local === '1' || (LOCAL_DEFAULT && query.cdn !== '1');
    if (wantLocal) {
      body = Buffer.from(localize(body.toString('utf8')), 'utf8');
      console.log(`[local-deps] ${pathname}`);
    }
  }

  send(res, 200, body, { 'Content-Type': type, 'Content-Length': body.length });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`serving ${ROOT} at http://127.0.0.1:${PORT}/`);
  console.log(`nostr-chat: http://127.0.0.1:${PORT}/nostr-chat/`);
  for (const m of MOUNTS) {
    console.log(`  ${m.prefix} -> ${fs.existsSync(m.real) ? m.real : m.real + '  (MISSING)'}`);
  }
  console.log(`local deps: ${LOCAL_DEFAULT ? 'ON' : 'off'} (env ZELLOUS_LOCAL_DEPS=1 to flip, ?local=1 / ?cdn=1 per request)`);
});
