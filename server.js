import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, normalize } from 'path';
import { promises as fsp } from 'fs';
import { pack } from 'msgpackr';
import cors from 'cors';
import logger from '@sequentialos/sequential-logging';

import { initialize, startCleanup, stopCleanup } from './server/db.js';
import { optionalAuth } from './server/auth-ops.js';
import { BotConnection } from './server/bot-websocket.js';
import { initializeLiveKit, stopLivekitServer } from './server/livekit.js';
import { makeHttpProxy, makeWsProxy, makeTokenRouter } from './server/routes-livekit.js';
import { setupWebSocket } from './server/ws-handler.js';
import makeAuthRouter from './server/routes-auth.js';
import makeRoomsRouter from './server/routes-rooms.js';
import makeServersRouter from './server/routes-servers.js';
import { makeBotsRouter, makeBotRoomsRouter } from './server/routes-bots.js';
import { registerHandler, getHandlers } from './server/handlers.js';
import { useMiddleware } from './server/middleware.js';
import { loadPlugins } from './server/plugin-loader.js';
import { errorMiddleware } from './server/errors.js';
import { getConfig, watchConfig } from './server/config.js';
import { EventEmitter } from 'events';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = getConfig();
const PORT = config.port;
const HOST = config.host;
const ROOMS_UI_DIR = join(__dirname, 'rooms-ui');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
const eventBus = new EventEmitter();
eventBus.setMaxListeners(0);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: config.maxBodySize }));
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', `frame-ancestors ${config.frameAncestors}`);
  next();
});
app.use(express.static(__dirname));
app.use(optionalAuth);

const state = {
  clients: new Map(),
  counter: 0,
  roomUsers: new Map(),
  mediaSessions: new Map(),
  config: { pingInterval: config.pingInterval },
};

const broadcast = (msg, exclude = null, roomId = null) => {
  const data = pack(msg);
  for (const client of state.clients.values()) {
    if (client !== exclude && (!roomId || client.roomId === roomId) && client.ws.readyState === 1) {
      client.ws.send(data);
    }
  }
};
state.broadcast = broadcast;

app.use('/api/auth', makeAuthRouter());
app.use('/api/rooms', makeBotRoomsRouter(state, broadcast));
app.use('/api/rooms', makeRoomsRouter(state, broadcast));
app.use('/api/servers', makeServersRouter(broadcast));
app.use('/api/bots', makeBotsRouter(broadcast));
app.use('/api/livekit', makeTokenRouter(`${process.env.HOST || 'localhost'}:${PORT}`));

const safeRoomType = (n) => (!n || /[^a-zA-Z0-9_-]/.test(n)) ? null : n;

app.get('/api/room-types', async (req, res) => {
  try {
    const entries = await fsp.readdir(ROOMS_UI_DIR, { withFileTypes: true });
    res.json({ types: entries.filter(e => e.isDirectory() && safeRoomType(e.name)).map(e => e.name) });
  } catch { res.json({ types: [] }); }
});

app.get('/room-assets/:typeName/*', async (req, res) => {
  const typeName = safeRoomType(req.params.typeName);
  if (!typeName) return res.status(400).json({ error: 'Invalid room type name' });
  const normalized = normalize(req.params[0] || '');
  if (normalized.startsWith('..') || normalized.includes('/..')) return res.status(400).json({ error: 'Invalid path' });
  try { await fsp.access(join(ROOMS_UI_DIR, typeName, normalized)); res.sendFile(join(ROOMS_UI_DIR, typeName, normalized)); }
  catch { res.status(404).json({ error: 'File not found' }); }
});

app.get('/room-type/:typeName', async (req, res) => {
  const typeName = safeRoomType(req.params.typeName);
  if (!typeName) return res.status(400).json({ error: 'Invalid room type name' });
  const htmlPath = join(ROOMS_UI_DIR, typeName, 'index.html');
  try { await fsp.access(htmlPath); res.sendFile(htmlPath); }
  catch { res.sendFile(join(__dirname, 'index.html')); }
});

app.get('/room-type/:typeName/*', async (req, res) => {
  const typeName = safeRoomType(req.params.typeName);
  if (!typeName) return res.status(400).json({ error: 'Invalid room type name' });
  const normalized = normalize(req.params[0] || '');
  if (normalized.startsWith('..') || normalized.includes('/..')) return res.status(400).json({ error: 'Invalid path' });
  const filePath = join(ROOMS_UI_DIR, typeName, normalized);
  try { await fsp.access(filePath); res.sendFile(filePath); }
  catch { res.status(404).json({ error: 'File not found' }); }
});

app.use(errorMiddleware);

const startServer = async () => {
  await initialize(config);
  await initializeLiveKit();
  makeHttpProxy(app);
  makeWsProxy(server, wss);
  setupWebSocket(wss, state, BotConnection);
  startCleanup();

  const plugins = await loadPlugins(app, eventBus, config.pluginsDir);

  watchConfig((newConfig) => {
    state.config.pingInterval = newConfig.pingInterval;
    logger.info('[Config] Reloaded');
  });

  const shutdown = async () => {
    logger.info('[Server] Shutting down...');
    stopLivekitServer();
    stopCleanup();
    for (const client of state.clients.values()) client.ws.close();
    server.close(() => { logger.info('[Server] Closed'); process.exit(0); });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(PORT, HOST, () => {
    const storageMode = config.busybaseUrl ? `remote (${config.busybaseUrl})` : 'embedded (LanceDB)';
    const livekitStatus = process.env.LIVEKIT_URL ? `external (${process.env.LIVEKIT_URL})` : 'local (auto-managed)';
    logger.info([
      `[Zellous] Server ready`,
      `  [CONFIG] url:     http://${HOST}:${PORT}`,
      `  [CONFIG] storage: ${storageMode}`,
      `  [CONFIG] livekit: ${livekitStatus}`,
      `  [CONFIG] data:    ${config.dataDir}`,
      `  [CONFIG] plugins: ${plugins.length} loaded`,
    ].join('\n'));
  });
};

startServer().catch(console.error);

export { app, server, state, broadcast, registerHandler, useMiddleware, eventBus };
