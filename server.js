import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { pack } from 'msgpackr';
import cors from 'cors';
import logger from '@sequentialos/sequential-logging';

import { initialize, startCleanup, stopCleanup, getDataRoot } from './server/db.js';
import { optionalAuth } from './server/auth-ops.js';
import { BotConnection } from './server/bot-websocket.js';
import { makeBotsRouter, makeBotRoomsRouter } from './server/routes-bots.js';
import { authRouter, userRouter } from './server/routes-auth.js';
import makeRoomsRouter from './server/routes-rooms.js';
import makeServersRouter from './server/routes-servers.js';
import makeNostrRouter from './server/routes-nostr.js';
import { makeHttpProxy, makeWsProxy, makeTokenRouter } from './server/routes-livekit.js';
import { initializeLiveKit, stopLivekitServer } from './server/livekit.js';
import { setupWebSocket } from './server/ws-handler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: process.env.MAX_BODY_SIZE || '50mb' }));
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  const ancestors = process.env.FRAME_ANCESTORS || "'self' https://os.247420.xyz https://*.247420.xyz http://localhost:* http://127.0.0.1:*";
  res.setHeader('Content-Security-Policy', `frame-ancestors ${ancestors}`);
  next();
});
app.use(express.static(__dirname));
app.use(optionalAuth);

const state = {
  clients: new Map(),
  counter: 0,
  roomUsers: new Map(),
  mediaSessions: new Map()
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

app.use('/api/auth', authRouter);
app.use('/api', userRouter);
app.use('/api/rooms', makeRoomsRouter(state, broadcast));
app.use('/api/servers', makeServersRouter(broadcast));
app.use('/api/bots', makeBotsRouter(broadcast));
app.use('/api/bot-rooms', makeBotRoomsRouter(state, broadcast));
app.use('/api/livekit', makeTokenRouter());
app.use('/api/nostr', makeNostrRouter());

const { pingInterval } = setupWebSocket(wss, state, BotConnection);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const startServer = async () => {
  await initialize();
  await initializeLiveKit();
  makeHttpProxy(app);
  makeWsProxy(server, wss);
  startCleanup();

  const shutdown = async () => {
    logger.info('[Server] Shutting down...');
    stopLivekitServer();
    stopCleanup();
    clearInterval(pingInterval);
    for (const client of state.clients.values()) client.ws.close();
    server.close(() => { logger.info('[Server] Closed'); process.exit(0); });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(PORT, HOST, () => {
    logger.info(`[Zellous] Server running on http://${HOST}:${PORT}`);
    logger.info(`[Zellous] Data directory: ${getDataRoot() || './data'}`);
  });
};

startServer().catch(console.error);

export { app, server, state, broadcast };
