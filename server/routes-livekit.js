import { Router } from 'express';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { getLkSdk, getConfig, buildIceServers } from './livekit.js';
import { optionalAuth } from './auth-ops.js';
import logger from '@sequentialos/sequential-logging';

const LK_PORT = parseInt(process.env.LIVEKIT_HTTP_PORT || '7882');
const PROXY_PATH = '/livekit';

const makeHttpProxy = (app) => {
  app.use((req, res, next) => {
    if (!req.path.startsWith(PROXY_PATH)) return next();
    const suffix = req.url.slice(PROXY_PATH.length) || '/';
    const options = {
      hostname: '127.0.0.1', port: LK_PORT, path: suffix, method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${LK_PORT}`, 'x-forwarded-for': req.ip || '', 'x-forwarded-proto': req.protocol },
    };
    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });
    proxyReq.on('error', (e) => {
      logger.error('[LiveKit Proxy]', e.message);
      if (!res.headersSent) res.status(502).json({ error: 'LiveKit unavailable' });
    });
    req.pipe(proxyReq, { end: true });
  });
};

const makeWsProxy = (server, wss) => {
  const lkWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (!url.pathname.startsWith(PROXY_PATH)) {
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
      return;
    }
    lkWss.handleUpgrade(request, socket, head, (clientWs) => {
      const targetPath = url.pathname.slice(PROXY_PATH.length) || '/';
      const targetUrl = `ws://127.0.0.1:${LK_PORT}${targetPath}${url.search}`;
      const targetWs = new WebSocket(targetUrl, { headers: { 'x-forwarded-for': socket.remoteAddress || '' }, perMessageDeflate: false });
      targetWs.on('open', () => {
        targetWs.on('message', (data, isBinary) => { if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBinary }); });
        targetWs.on('close', (code, reason) => { if (clientWs.readyState === WebSocket.OPEN) clientWs.close(code, reason); });
        targetWs.on('error', (e) => { logger.error('[LiveKit WS] Target:', e.message); if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1011); });
      });
      clientWs.on('message', (data, isBinary) => { if (targetWs.readyState === WebSocket.OPEN) targetWs.send(data, { binary: isBinary }); });
      clientWs.on('close', () => { if (targetWs.readyState !== WebSocket.CLOSED) targetWs.close(); });
      clientWs.on('error', (e) => { logger.error('[LiveKit WS] Client:', e.message); if (targetWs.readyState !== WebSocket.CLOSED) targetWs.close(); });
      targetWs.on('error', (e) => { logger.error('[LiveKit WS] Connect:', e.message); if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1011); });
    });
  });
};

const makeTokenRouter = (host) => {
  const router = Router();
  router.get('/token', optionalAuth, async (req, res) => {
    const { channel, identity, forceRelay } = req.query;
    if (!channel || !identity) return res.status(400).json({ error: 'channel and identity required' });
    if (identity.length > 128 || channel.length > 64) return res.status(400).json({ error: 'identity or channel too long' });
    const cfg = getConfig();
    if (!cfg.url || !cfg.apiKey || !cfg.apiSecret) return res.status(503).json({ error: 'LiveKit not configured' });
    try {
      const { AccessToken } = await getLkSdk();
      const token = new AccessToken(cfg.apiKey, cfg.apiSecret, { identity, ttl: '6h' });
      token.addGrant({ roomJoin: true, roomCreate: true, room: `zellous-${channel}`, canPublish: true, canSubscribe: true, canPublishData: true });
      const jwt = await token.toJwt();
      const iceServers = buildIceServers(cfg);
      const rtcConfig = iceServers.length > 1 ? { iceServers, ...(forceRelay === 'true' ? { iceTransportPolicy: 'relay' } : {}) } : undefined;
      const proto = req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
      const reqHost = req.headers.host || host;
      res.json({ token: jwt, url: `${proto}://${reqHost}${PROXY_PATH}`, rtcConfig });
    } catch (e) {
      logger.error('[LiveKit] Token error:', e.message);
      res.status(500).json({ error: 'Failed to generate voice token' });
    }
  });
  return router;
};

export { makeHttpProxy, makeWsProxy, makeTokenRouter };
