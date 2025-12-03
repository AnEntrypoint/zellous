import { promises as fs } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { DATA_ROOT, ensureDir } from './storage-utils.js';
import { validators } from './validation.js';
import { responses } from './response-formatter.js';

// Bot API - Simple connectivity for bots and external clients
// Supports both REST API and simplified WebSocket protocol

const BOTS_DIR = join(DATA_ROOT, 'bots');

const ensureBotsDir = async () => ensureDir(BOTS_DIR);

// Generate API key
const generateApiKey = () => `zb_${crypto.randomBytes(32).toString('hex')}`;

// Hash API key for storage
const hashApiKey = (key) => {
  return crypto.createHash('sha256').update(key).digest('hex');
};

// ==================== BOT MANAGEMENT ====================

const bots = {
  async create(name, ownerId, permissions = []) {
    await ensureBotsDir();

    const botId = crypto.randomBytes(8).toString('hex');
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    const bot = {
      id: botId,
      name,
      ownerId,
      apiKeyHash,
      permissions: permissions.length ? permissions : ['read', 'write', 'speak'],
      createdAt: Date.now(),
      lastUsedAt: null,
      webhookUrl: null,
      allowedRooms: [], // Empty = all rooms allowed
      metadata: {}
    };

    await fs.writeFile(
      join(BOTS_DIR, `${botId}.json`),
      JSON.stringify(bot, null, 2)
    );

    // Return the API key only once (it's hashed in storage)
    return { bot: { ...bot, apiKeyHash: undefined }, apiKey };
  },

  async findById(botId) {
    try {
      const data = await fs.readFile(join(BOTS_DIR, `${botId}.json`), 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  async findByApiKey(apiKey) {
    const validation = validators.apiKey(apiKey);
    if (!validation.valid) return null;

    await ensureBotsDir();
    const keyHash = hashApiKey(apiKey);

    try {
      const files = await fs.readdir(BOTS_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const bot = JSON.parse(await fs.readFile(join(BOTS_DIR, file), 'utf8'));
            if (bot.apiKeyHash === keyHash) {
              return bot;
            }
          } catch {}
        }
      }
    } catch {}
    return null;
  },

  async update(botId, updates) {
    const bot = await this.findById(botId);
    if (!bot) return null;
    Object.assign(bot, updates);
    await fs.writeFile(
      join(BOTS_DIR, `${botId}.json`),
      JSON.stringify(bot, null, 2)
    );
    return bot;
  },

  async delete(botId) {
    try {
      await fs.unlink(join(BOTS_DIR, `${botId}.json`));
      return true;
    } catch {
      return false;
    }
  },

  async listByOwner(ownerId) {
    await ensureBotsDir();
    const result = [];
    try {
      const files = await fs.readdir(BOTS_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const bot = JSON.parse(await fs.readFile(join(BOTS_DIR, file), 'utf8'));
            if (bot.ownerId === ownerId) {
              result.push({ ...bot, apiKeyHash: undefined });
            }
          } catch {}
        }
      }
    } catch {}
    return result;
  },

  async regenerateApiKey(botId) {
    const bot = await this.findById(botId);
    if (!bot) return null;

    const apiKey = generateApiKey();
    bot.apiKeyHash = hashApiKey(apiKey);
    await this.update(botId, { apiKeyHash: bot.apiKeyHash });

    return apiKey;
  },

  async setWebhook(botId, webhookUrl) {
    return this.update(botId, { webhookUrl });
  },

  async hasPermission(bot, permission) {
    return bot.permissions.includes(permission) || bot.permissions.includes('admin');
  },

  async canAccessRoom(bot, roomId) {
    if (bot.allowedRooms.length === 0) return true;
    return bot.allowedRooms.includes(roomId);
  },

  async touch(botId) {
    return this.update(botId, { lastUsedAt: Date.now() });
  }
};

// ==================== BOT AUTHENTICATION ====================

// Parse bot API key from request
const parseBotApiKey = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bot ')) {
    return authHeader.slice(4);
  }
  if (req.query?.api_key) {
    return req.query.api_key;
  }
  return null;
};

// Express middleware for bot auth
const requireBotAuth = async (req, res, next) => {
  const apiKey = parseBotApiKey(req);
  if (!apiKey) {
    return responses.send(res, responses.unauthorized('Bot API key required'));
  }

  const bot = await bots.findByApiKey(apiKey);
  if (!bot) {
    return responses.send(res, responses.unauthorized('Invalid API key'));
  }

  await bots.touch(bot.id);
  req.bot = bot;
  next();
};

// Check bot permission middleware factory
const requireBotPermission = (permission) => async (req, res, next) => {
  if (!req.bot) {
    return responses.send(res, responses.unauthorized('Bot authentication required'));
  }
  if (!await bots.hasPermission(req.bot, permission)) {
    return responses.send(res, responses.forbidden(`Permission '${permission}' required`));
  }
  next();
};

// Check room access middleware
const requireRoomAccess = async (req, res, next) => {
  const roomId = req.params.roomId || req.body?.roomId;
  if (!roomId) {
    return responses.send(res, responses.badRequest('Room ID required'));
  }
  if (!await bots.canAccessRoom(req.bot, roomId)) {
    return responses.send(res, responses.forbidden('Bot not allowed in this room'));
  }
  next();
};

// ==================== BOT WEBSOCKET PROTOCOL ====================

// Simplified WebSocket message types for bots:
// Bot → Server:
//   { type: 'auth', apiKey: 'zb_...' }
//   { type: 'join', roomId: 'room' }
//   { type: 'leave' }
//   { type: 'text', content: 'message' }
//   { type: 'audio', data: Uint8Array }
//   { type: 'file', filename: 'name', data: Uint8Array }
//
// Server → Bot:
//   { type: 'auth_success', botId: 'id', name: 'name' }
//   { type: 'auth_error', error: 'message' }
//   { type: 'joined', roomId: 'room', users: [...] }
//   { type: 'user_joined', userId, username }
//   { type: 'user_left', userId }
//   { type: 'text', userId, username, content, timestamp }
//   { type: 'audio_start', userId, username }
//   { type: 'audio_chunk', userId, data }
//   { type: 'audio_end', userId }
//   { type: 'file', userId, username, filename, fileId, size }
//   { type: 'error', error: 'message' }

class BotConnection {
  constructor(ws, broadcast, serverState) {
    this.ws = ws;
    this.broadcast = broadcast;
    this.serverState = serverState;
    this.bot = null;
    this.roomId = null;
    this.clientId = null;

    this.handlers = {
      auth: this.handleAuth.bind(this),
      join: this.handleJoin.bind(this),
      leave: this.handleLeave.bind(this),
      text: this.handleText.bind(this),
      audio_start: this.handleAudioStart.bind(this),
      audio_chunk: this.handleAudioChunk.bind(this),
      audio_end: this.handleAudioEnd.bind(this),
      file: this.handleFile.bind(this)
    };
  }

  send(msg) {
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  async handleMessage(data) {
    try {
      const msg = typeof data === 'string' ? JSON.parse(data) : data;
      const handler = this.handlers[msg.type];
      if (handler) {
        await handler(msg);
      } else {
        this.send({ type: 'error', error: `Unknown message type: ${msg.type}` });
      }
    } catch (e) {
      this.send({ type: 'error', error: 'Invalid message format' });
    }
  }

  async handleAuth(msg) {
    const bot = await bots.findByApiKey(msg.apiKey);
    if (!bot) {
      this.send({ type: 'auth_error', error: 'Invalid API key' });
      return;
    }

    this.bot = bot;
    this.clientId = `bot_${bot.id}`;
    await bots.touch(bot.id);

    this.send({
      type: 'auth_success',
      botId: bot.id,
      name: bot.name
    });
  }

  async handleJoin(msg) {
    if (!this.bot) {
      this.send({ type: 'error', error: 'Authentication required' });
      return;
    }

    if (!await bots.canAccessRoom(this.bot, msg.roomId)) {
      this.send({ type: 'error', error: 'Room access denied' });
      return;
    }

    this.roomId = msg.roomId || 'lobby';

    // Register with server state
    this.serverState.clients.set(this.ws, {
      id: this.clientId,
      ws: this.ws,
      username: `[Bot] ${this.bot.name}`,
      speaking: false,
      roomId: this.roomId,
      isBot: true,
      botId: this.bot.id
    });

    // Get current users in room
    const roomUsers = Array.from(this.serverState.clients.values())
      .filter(c => c.roomId === this.roomId && c !== this.serverState.clients.get(this.ws))
      .map(c => ({ id: c.id, username: c.username, isBot: c.isBot }));

    this.send({
      type: 'joined',
      roomId: this.roomId,
      users: roomUsers
    });

    // Notify room of bot joining
    this.broadcast(
      { type: 'user_joined', user: `[Bot] ${this.bot.name}`, userId: this.clientId, isBot: true },
      this.serverState.clients.get(this.ws),
      this.roomId
    );
  }

  async handleLeave() {
    if (this.roomId) {
      this.broadcast(
        { type: 'user_left', userId: this.clientId, isBot: true },
        this.serverState.clients.get(this.ws),
        this.roomId
      );
      this.roomId = null;
      this.serverState.clients.delete(this.ws);
    }
  }

  async handleText(msg) {
    if (!this.roomId) {
      this.send({ type: 'error', error: 'Not in a room' });
      return;
    }

    if (!await bots.hasPermission(this.bot, 'write')) {
      this.send({ type: 'error', error: 'Write permission required' });
      return;
    }

    this.broadcast({
      type: 'text_message',
      userId: this.clientId,
      username: `[Bot] ${this.bot.name}`,
      content: msg.content,
      timestamp: Date.now(),
      isBot: true
    }, null, this.roomId);
  }

  async handleAudioStart() {
    if (!this.roomId) {
      this.send({ type: 'error', error: 'Not in a room' });
      return;
    }

    if (!await bots.hasPermission(this.bot, 'speak')) {
      this.send({ type: 'error', error: 'Speak permission required' });
      return;
    }

    const client = this.serverState.clients.get(this.ws);
    if (client) client.speaking = true;

    this.broadcast({
      type: 'speaker_joined',
      user: `[Bot] ${this.bot.name}`,
      userId: this.clientId,
      isBot: true
    }, null, this.roomId);
  }

  async handleAudioChunk(msg) {
    if (!this.roomId) return;

    this.broadcast({
      type: 'audio_data',
      userId: this.clientId,
      data: msg.data,
      isBot: true
    }, this.serverState.clients.get(this.ws), this.roomId);
  }

  async handleAudioEnd() {
    if (!this.roomId) return;

    const client = this.serverState.clients.get(this.ws);
    if (client) client.speaking = false;

    this.broadcast({
      type: 'speaker_left',
      userId: this.clientId,
      user: `[Bot] ${this.bot.name}`,
      isBot: true
    }, null, this.roomId);
  }

  async handleFile(msg) {
    if (!this.roomId) {
      this.send({ type: 'error', error: 'Not in a room' });
      return;
    }

    if (!await bots.hasPermission(this.bot, 'write')) {
      this.send({ type: 'error', error: 'Write permission required' });
      return;
    }

    // File handling will be integrated with main file system
    this.broadcast({
      type: 'file_shared',
      userId: this.clientId,
      username: `[Bot] ${this.bot.name}`,
      filename: msg.filename,
      size: msg.data?.length || 0,
      timestamp: Date.now(),
      isBot: true
    }, null, this.roomId);
  }

  cleanup() {
    if (this.roomId) {
      this.handleLeave();
    }
  }
}

// ==================== REST API ROUTES ====================

const setupBotApiRoutes = (app, state, broadcast) => {
  // Create bot (requires user auth)
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

  // List user's bots
  app.get('/api/bots', async (req, res) => {
    if (!req.user) {
      return responses.send(res, responses.unauthorized());
    }

    const userBots = await bots.listByOwner(req.user.id);
    res.json({ bots: userBots });
  });

  // Get bot info
  app.get('/api/bots/:botId', requireBotAuth, async (req, res) => {
    res.json({ bot: { ...req.bot, apiKeyHash: undefined } });
  });

  // Update bot
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

  // Delete bot
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

  // Regenerate API key
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

  // Bot: Get room info
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

  // Bot: Send text message to room
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

  // Bot: Get recent messages
  app.get('/api/rooms/:roomId/messages', requireBotAuth, requireBotPermission('read'), requireRoomAccess, async (req, res) => {
    const { messages: msgStore } = await import('./storage.js');
    const msgs = await msgStore.getRecent(req.params.roomId, parseInt(req.query.limit) || 50);
    res.json({ messages: msgs });
  });

  // Bot: Upload file
  app.post('/api/rooms/:roomId/files', requireBotAuth, requireBotPermission('write'), requireRoomAccess, async (req, res) => {
    // Handle file upload (expects raw body or base64)
    const { filename, data, path: customPath } = req.body;
    if (!filename || !data) {
      return responses.send(res, responses.badRequest('Filename and data required'));
    }

    const { files } = await import('./storage.js');
    const fileBuffer = Buffer.from(data, 'base64');
    const fileMeta = await files.save(req.params.roomId, `bot_${req.bot.id}`, filename, fileBuffer, customPath || '');

    // Broadcast file share event
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

  // Bot: List files
  app.get('/api/rooms/:roomId/files', requireBotAuth, requireBotPermission('read'), requireRoomAccess, async (req, res) => {
    const { files } = await import('./storage.js');
    const fileList = await files.list(req.params.roomId, req.query.path || '');
    res.json({ files: fileList });
  });

  // Bot: Download file
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

export {
  bots,
  parseBotApiKey,
  requireBotAuth,
  requireBotPermission,
  requireRoomAccess,
  BotConnection,
  setupBotApiRoutes
};
