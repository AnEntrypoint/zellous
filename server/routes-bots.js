import { Router } from 'express';
import { bots } from './db.js';
import { validators } from './utils.js';
import { requireBotAuth, requireBotPermission, requireRoomAccess } from './bot-middleware.js';
import { optionalAuth } from './auth-ops.js';
import { promises as fsp } from 'fs';

const passIfNoBotKey = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bot ') && !req.query?.api_key) return next('route');
  next();
};

const makeBotsRouter = (broadcast) => {
  const router = Router();

  router.post('/', optionalAuth, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { name, permissions, allowedRooms } = req.body;
    const v = validators.botName(name);
    if (!v.valid) return res.status(400).json({ error: v.error });
    const result = await bots.create(name, req.user.id, permissions);
    if (allowedRooms) await bots.update(result.bot.id, { allowedRooms });
    res.json(result);
  });

  router.get('/', optionalAuth, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    res.json({ bots: await bots.listByOwner(req.user.id) });
  });

  router.get('/:botId', requireBotAuth, async (req, res) => {
    res.json({ bot: { ...req.bot, apiKeyHash: undefined } });
  });

  router.patch('/:botId', optionalAuth, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const bot = await bots.findById(req.params.botId);
    if (!bot || bot.ownerId !== req.user.id) return res.status(404).json({ error: 'Bot not found' });
    const { name, permissions, allowedRooms, webhookUrl } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (permissions) updates.permissions = permissions;
    if (allowedRooms) updates.allowedRooms = allowedRooms;
    if (webhookUrl !== undefined) updates.webhookUrl = webhookUrl;
    const updated = await bots.update(bot.id, updates);
    res.json({ bot: { ...updated, apiKeyHash: undefined } });
  });

  router.delete('/:botId', optionalAuth, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const bot = await bots.findById(req.params.botId);
    if (!bot || bot.ownerId !== req.user.id) return res.status(404).json({ error: 'Bot not found' });
    await bots.delete(bot.id);
    res.json({ success: true });
  });

  router.post('/:botId/regenerate-key', optionalAuth, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const bot = await bots.findById(req.params.botId);
    if (!bot || bot.ownerId !== req.user.id) return res.status(404).json({ error: 'Bot not found' });
    const apiKey = await bots.regenerateApiKey(bot.id);
    res.json({ apiKey });
  });

  return router;
};

const makeBotRoomsRouter = (state, broadcast) => {
  const router = Router();

  router.get('/:roomId', passIfNoBotKey, requireBotAuth, requireRoomAccess, async (req, res) => {
    const roomId = req.params.roomId;
    const users = Array.from(state.clients.values())
      .filter(c => c.roomId === roomId)
      .map(c => ({ id: c.id, username: c.username, speaking: c.speaking, isBot: c.isBot }));
    res.json({ roomId, users, userCount: users.length });
  });

  router.post('/:roomId/messages', passIfNoBotKey, requireBotAuth, requireBotPermission('write'), requireRoomAccess, async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Message content required' });
    const msg = { type: 'text_message', userId: `bot_${req.bot.id}`, username: `[Bot] ${req.bot.name}`, content, timestamp: Date.now(), isBot: true };
    broadcast(msg, null, req.params.roomId);
    res.json({ success: true, message: msg });
  });

  router.get('/:roomId/messages', passIfNoBotKey, requireBotAuth, requireBotPermission('read'), requireRoomAccess, async (req, res) => {
    const { messages } = await import('./db.js');
    const msgs = await messages.getRecent(req.params.roomId, parseInt(req.query.limit) || 50);
    res.json({ messages: msgs });
  });

  router.post('/:roomId/files', passIfNoBotKey, requireBotAuth, requireBotPermission('write'), requireRoomAccess, async (req, res) => {
    const { filename, data, path: customPath } = req.body;
    if (!filename || !data) return res.status(400).json({ error: 'Filename and data required' });
    const { files } = await import('./db.js');
    const fileMeta = await files.save(req.params.roomId, `bot_${req.bot.id}`, filename, Buffer.from(data, 'base64'), customPath || '');
    broadcast({ type: 'file_shared', userId: `bot_${req.bot.id}`, username: `[Bot] ${req.bot.name}`, file: fileMeta, timestamp: Date.now(), isBot: true }, null, req.params.roomId);
    res.json({ file: fileMeta });
  });

  router.get('/:roomId/files', passIfNoBotKey, requireBotAuth, requireBotPermission('read'), requireRoomAccess, async (req, res) => {
    const { files } = await import('./db.js');
    res.json({ files: await files.list(req.params.roomId, req.query.path || '') });
  });

  router.get('/:roomId/files/:fileId', passIfNoBotKey, requireBotAuth, requireBotPermission('read'), requireRoomAccess, async (req, res) => {
    const { files } = await import('./db.js');
    const file = await files.get(req.params.roomId, req.params.fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const data = await fsp.readFile(file.filepath);
    res.set('Content-Type', file.meta?.mimeType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${file.meta?.originalName || 'download'}"`);
    res.send(data);
  });

  return router;
};

export { makeBotsRouter, makeBotRoomsRouter };
