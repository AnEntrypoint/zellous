import { bots } from './bot-store.js';
import { requireBotAuth, requireBotPermission, requireRoomAccess } from './bot-auth.js';
import { validators } from './validation.js';
import { responses } from './response-formatter.js';

const setupBotApiRoutes = (app, state, broadcast) => {
  app.post('/api/bots', async (req, res) => {
    if (!req.user) {
      return responses.send(res, responses.unauthorized());
    }

    const { name, permissions, allowedRooms } = req.body;
    const nameValidation = validators.botName(name);
    if (!nameValidation.valid) {
      return responses.send(res, responses.badRequest(nameValidation.error));
    }

    const result = await bots.create(name, req.user.id, permissions);
    if (allowedRooms) {
      await bots.update(result.bot.id, { allowedRooms });
    }

    res.json(result);
  });

  app.get('/api/bots', async (req, res) => {
    if (!req.user) {
      return responses.send(res, responses.unauthorized());
    }

    const userBots = await bots.listByOwner(req.user.id);
    res.json({ bots: userBots });
  });

  app.get('/api/bots/:botId', requireBotAuth, async (req, res) => {
    res.json({ bot: { ...req.bot, apiKeyHash: undefined } });
  });

  app.patch('/api/bots/:botId', async (req, res) => {
    if (!req.user) {
      return responses.send(res, responses.unauthorized());
    }

    const bot = await bots.findById(req.params.botId);
    if (!bot || bot.ownerId !== req.user.id) {
      return responses.send(res, responses.notFound('Bot not found'));
    }

    const { name, permissions, allowedRooms, webhookUrl } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (permissions) updates.permissions = permissions;
    if (allowedRooms) updates.allowedRooms = allowedRooms;
    if (webhookUrl !== undefined) updates.webhookUrl = webhookUrl;

    const updated = await bots.update(bot.id, updates);
    res.json({ bot: { ...updated, apiKeyHash: undefined } });
  });

  app.delete('/api/bots/:botId', async (req, res) => {
    if (!req.user) {
      return responses.send(res, responses.unauthorized());
    }

    const bot = await bots.findById(req.params.botId);
    if (!bot || bot.ownerId !== req.user.id) {
      return responses.send(res, responses.notFound('Bot not found'));
    }

    await bots.delete(bot.id);
    res.json({ success: true });
  });

  app.post('/api/bots/:botId/regenerate-key', async (req, res) => {
    if (!req.user) {
      return responses.send(res, responses.unauthorized());
    }

    const bot = await bots.findById(req.params.botId);
    if (!bot || bot.ownerId !== req.user.id) {
      return responses.send(res, responses.notFound('Bot not found'));
    }

    const apiKey = await bots.regenerateApiKey(bot.id);
    res.json({ apiKey });
  });

  app.get('/api/rooms/:roomId', requireBotAuth, requireRoomAccess, async (req, res) => {
    const roomId = req.params.roomId;
    const users = Array.from(state.clients.values())
      .filter(c => c.roomId === roomId)
      .map(c => ({ id: c.id, username: c.username, speaking: c.speaking, isBot: c.isBot }));

    res.json({
      roomId,
      users,
      userCount: users.length
    });
  });

  app.post('/api/rooms/:roomId/messages', requireBotAuth, requireBotPermission('write'), requireRoomAccess, async (req, res) => {
    const { content } = req.body;
    if (!content) {
      return responses.send(res, responses.badRequest('Message content required'));
    }

    const msg = {
      type: 'text_message',
      userId: `bot_${req.bot.id}`,
      username: `[Bot] ${req.bot.name}`,
      content,
      timestamp: Date.now(),
      isBot: true
    };

    broadcast(msg, null, req.params.roomId);
    res.json({ success: true, message: msg });
  });

  app.get('/api/rooms/:roomId/messages', requireBotAuth, requireBotPermission('read'), requireRoomAccess, async (req, res) => {
    const { messages: msgStore } = await import('./storage.js');
    const msgs = await msgStore.getRecent(req.params.roomId, parseInt(req.query.limit) || 50);
    res.json({ messages: msgs });
  });

  app.post('/api/rooms/:roomId/files', requireBotAuth, requireBotPermission('write'), requireRoomAccess, async (req, res) => {
    const { filename, data, path: customPath } = req.body;
    if (!filename || !data) {
      return responses.send(res, responses.badRequest('Filename and data required'));
    }

    const { files } = await import('./storage.js');
    const fileBuffer = Buffer.from(data, 'base64');
    const fileMeta = await files.save(req.params.roomId, `bot_${req.bot.id}`, filename, fileBuffer, customPath || '');

    broadcast({
      type: 'file_shared',
      userId: `bot_${req.bot.id}`,
      username: `[Bot] ${req.bot.name}`,
      file: fileMeta,
      timestamp: Date.now(),
      isBot: true
    }, null, req.params.roomId);

    res.json({ file: fileMeta });
  });

  app.get('/api/rooms/:roomId/files', requireBotAuth, requireBotPermission('read'), requireRoomAccess, async (req, res) => {
    const { files } = await import('./storage.js');
    const fileList = await files.list(req.params.roomId, req.query.path || '');
    res.json({ files: fileList });
  });

  app.get('/api/rooms/:roomId/files/:fileId', requireBotAuth, requireBotPermission('read'), requireRoomAccess, async (req, res) => {
    const { files } = await import('./storage.js');
    const file = await files.get(req.params.roomId, req.params.fileId);
    if (!file) {
      return responses.send(res, responses.notFound('File not found'));
    }

    const { promises: fs } = await import('fs');
    const data = await fs.readFile(file.filepath);

    res.set('Content-Type', file.meta?.mimeType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${file.meta?.originalName || 'download'}"`);
    res.send(data);
  });
};

export { setupBotApiRoutes };
