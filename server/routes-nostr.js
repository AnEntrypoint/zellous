import { Router } from 'express';
import { getLkSdk, getConfig, buildIceServers } from './livekit.js';
import logger from '@sequentialos/sequential-logging';

const RATE_LIMIT = parseInt(process.env.NOSTR_RATE_LIMIT || '20');
const RATE_WINDOW = parseInt(process.env.NOSTR_RATE_WINDOW || '60000');
const rateMap = new Map();

const checkRate = (ip) => {
  const now = Date.now();
  for (const [k, v] of rateMap) { if (v.resetAt < now) rateMap.delete(k); }
  const entry = rateMap.get(ip) || { count: 0, resetAt: now + RATE_WINDOW };
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  rateMap.set(ip, entry);
  return true;
};

const makeRouter = () => {
  const router = Router();

  router.get('/ping', (req, res) => res.json({ ok: true }));

  router.get('/livekit-token', async (req, res) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    if (!checkRate(ip)) return res.status(429).json({ error: 'Rate limit exceeded' });
    const { channel, identity } = req.query;
    if (!channel || !identity) return res.status(400).json({ error: 'channel and identity required' });
    if (!/^[0-9a-f]{64}$/.test(identity)) return res.status(400).json({ error: 'identity must be 64-char hex string' });
    const cfg = getConfig();
    if (!cfg.url || !cfg.apiKey || !cfg.apiSecret) return res.status(503).json({ error: 'LiveKit not configured' });
    try {
      const { AccessToken } = await getLkSdk();
      const token = new AccessToken(cfg.apiKey, cfg.apiSecret, { identity, ttl: '6h' });
      token.addGrant({ roomJoin: true, roomCreate: true, room: `zellous-${channel}`, canPublish: true, canSubscribe: true, canPublishData: true });
      const jwt = await token.toJwt();
      const iceServers = buildIceServers(cfg);
      const rtcConfig = iceServers.length > 1 ? { iceServers } : undefined;
      const proto = req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
      const reqHost = req.headers.host;
      res.json({ url: `${proto}://${reqHost}/livekit`, token: jwt, rtcConfig });
    } catch (e) {
      logger.error('[Nostr] Token error:', e.message);
      throw e;
    }
  });

  return router;
};

export default makeRouter;
