import { pack, unpack } from 'msgpackr';
import { rooms, messages, media, files } from './db.js';
import { authenticateWebSocket } from './auth-ops.js';
import { getHandler } from './handlers.js';
import logger from '@sequentialos/sequential-logging';

const createClient = (ws, id, user = null) => ({
  id, ws,
  username: user?.displayName || `User${id}`,
  userId: user?.id || null,
  sessionId: null,
  speaking: false,
  roomId: 'lobby',
  isBot: false,
  isAuthenticated: !!user,
  _alive: true
});

const joinRoom = async (client, roomId, state) => {
  const oldRoomId = client.roomId;
  if (oldRoomId && oldRoomId !== roomId && state.roomUsers.has(oldRoomId)) {
    state.roomUsers.get(oldRoomId).delete(client.id);
    state.broadcast({ type: 'user_left', userId: client.id }, client, oldRoomId);
    const oldCount = state.roomUsers.get(oldRoomId).size;
    await rooms.setUserCount(oldRoomId, oldCount);
    if (oldCount === 0) { state.roomUsers.delete(oldRoomId); await rooms.scheduleCleanup(oldRoomId); }
  }
  client.roomId = roomId;
  if (!state.roomUsers.has(roomId)) { state.roomUsers.set(roomId, new Set()); await rooms.cancelCleanup(roomId); }
  state.roomUsers.get(roomId).add(client.id);
  await rooms.ensureRoom(roomId);
  await rooms.setUserCount(roomId, state.roomUsers.get(roomId).size);
};

const leaveRoom = async (client, state) => {
  const roomId = client.roomId;
  if (roomId && state.roomUsers.has(roomId)) {
    state.roomUsers.get(roomId).delete(client.id);
    const count = state.roomUsers.get(roomId).size;
    await rooms.setUserCount(roomId, count);
    if (count === 0) { state.roomUsers.delete(roomId); await rooms.scheduleCleanup(roomId); }
  }
};

const makeHandlers = (state) => ({
  authenticate: async (client, msg) => {
    const auth = await authenticateWebSocket(msg.token);
    if (auth) {
      client.userId = auth.user.id; client.username = auth.user.displayName;
      client.sessionId = auth.session.id; client.isAuthenticated = true;
      client.ws.send(pack({ type: 'auth_success', user: auth.user }));
    } else {
      client.ws.send(pack({ type: 'auth_failed', error: 'Invalid or expired token' }));
    }
  },
  join_room: async (client, msg) => {
    const roomId = msg.roomId || 'lobby';
    await joinRoom(client, roomId, state);
    const roomClients = Array.from(state.clients.values()).filter(c => c.roomId === roomId && c !== client);
    const [channels, categories] = await Promise.all([rooms.getChannels(roomId), rooms.getCategories(roomId)]);
    client.ws.send(pack({ type: 'room_joined', roomId, channels, categories, currentUsers: roomClients.map(c => ({ id: c.id, username: c.username, isBot: c.isBot, isAuthenticated: c.isAuthenticated })) }));
    state.broadcast({ type: 'user_joined', user: client.username, userId: client.id, isBot: client.isBot, isAuthenticated: client.isAuthenticated }, client, roomId);
  },
  audio_start: async (client) => {
    client.speaking = true;
    const mediaSessionId = await media.createSession(client.roomId, client.id, client.username);
    state.mediaSessions.set(client.id, mediaSessionId);
    state.broadcast({ type: 'speaker_joined', user: client.username, userId: client.id }, null, client.roomId);
  },
  audio_chunk: (client, msg) => {
    state.broadcast({ type: 'audio_data', userId: client.id, data: msg.data }, client, client.roomId);
    const sid = state.mediaSessions.get(client.id);
    if (sid) media.saveChunk(client.roomId, client.id, 'audio', msg.data, sid).catch(() => {});
  },
  audio_end: async (client) => {
    client.speaking = false;
    const sid = state.mediaSessions.get(client.id);
    if (sid) { await media.endSession(client.roomId, sid); state.mediaSessions.delete(client.id); }
    state.broadcast({ type: 'speaker_left', userId: client.id, user: client.username }, null, client.roomId);
  },
  video_chunk: (client, msg) => {
    state.broadcast({ type: 'video_chunk', userId: client.id, data: msg.data }, client, client.roomId);
    const sid = state.mediaSessions.get(client.id);
    if (sid) media.saveChunk(client.roomId, client.id, 'video', msg.data, sid).catch(() => {});
  },
  text_message: async (client, msg) => {
    const msgData = await messages.save(client.roomId, { userId: client.id, username: client.username, type: 'text', content: msg.content, channelId: msg.channelId || 'general' });
    state.broadcast({ ...msgData, type: 'text_message', isAuthenticated: client.isAuthenticated }, null, client.roomId);
  },
  image_message: async (client, msg) => {
    const fileMeta = await files.save(client.roomId, client.id, msg.filename || 'image.png', Buffer.from(msg.data, 'base64'), 'images');
    const msgData = await messages.save(client.roomId, { userId: client.id, username: client.username, type: 'image', content: msg.caption || '', channelId: msg.channelId || 'general', metadata: { fileId: fileMeta.id, filename: fileMeta.originalName, size: fileMeta.size, mimeType: fileMeta.mimeType } });
    state.broadcast({ ...msgData, type: 'image_message', isAuthenticated: client.isAuthenticated }, null, client.roomId);
  },
  file_upload_start: async (client, msg) => {
    state.broadcast({ type: 'file_upload_started', userId: client.id, username: client.username, filename: msg.filename, size: msg.size, uploadId: msg.uploadId }, null, client.roomId);
  },
  file_upload_chunk: async () => {},
  file_upload_complete: async (client, msg) => {
    const fileMeta = await files.save(client.roomId, client.id, msg.filename, Buffer.from(msg.data, 'base64'), msg.path || '');
    const msgData = await messages.save(client.roomId, { userId: client.id, username: client.username, type: 'file', content: msg.description || '', channelId: msg.channelId || 'general', metadata: { fileId: fileMeta.id, filename: fileMeta.originalName, size: fileMeta.size, mimeType: fileMeta.mimeType, path: fileMeta.path } });
    state.broadcast({ ...msgData, type: 'file_shared', isAuthenticated: client.isAuthenticated }, client, client.roomId);
  },
  set_username: async (client, msg) => {
    client.username = msg.username;
    state.broadcast({ type: 'user_updated', userId: client.id, username: msg.username }, null, client.roomId);
  },
  edit_message: async (client, msg) => {
    if (!msg.messageId || !msg.content?.trim()) return;
    const existing = await messages.getById(client.roomId, msg.messageId);
    if (!existing || (existing.userId !== client.id && !client.isAuthenticated)) return;
    const updated = await messages.update(client.roomId, msg.messageId, { content: msg.content.trim() });
    if (updated) state.broadcast({ type: 'message_updated', messageId: msg.messageId, content: updated.content, edited: true, editedAt: updated.editedAt }, null, client.roomId);
  },
  get_messages: async (client, msg) => {
    const channelId = msg.channelId || 'general';
    const msgs = await messages.getRecent(client.roomId, msg.limit || 50, msg.before, channelId);
    client.ws.send(pack({ type: 'message_history', messages: msgs, channelId }));
  },
  get_files: async (client, msg) => {
    const fileList = await files.list(client.roomId, msg.path || '');
    client.ws.send(pack({ type: 'file_list', files: fileList, path: msg.path || '' }));
  }
});

const setupWebSocket = (wss, state, BotConnection) => {
  const handlers = makeHandlers(state);

  const pingInterval = setInterval(() => {
    for (const client of state.clients.values()) {
      if (client._alive === false) { client.ws.terminate(); continue; }
      client._alive = false;
      client.ws.ping();
    }
  }, state.config?.pingInterval || 30000);

  wss.on('close', () => clearInterval(pingInterval));

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/bot/ws') {
      const botConn = new BotConnection(ws, state.broadcast, state);
      ws.on('message', (data) => botConn.handleMessage(data));
      ws.on('close', () => botConn.cleanup());
      return;
    }

    const clientId = ++state.counter;
    const token = url.searchParams.get('token');
    let user = null;
    if (token) { const auth = await authenticateWebSocket(token); if (auth) user = auth.user; }

    const client = createClient(ws, clientId, user);
    state.clients.set(ws, client);
    ws.on('pong', () => { client._alive = true; });

    ws.on('message', async (data) => {
      try {
        const msg = unpack(Buffer.isBuffer(data) ? data : Buffer.from(data));
        const handler = handlers[msg.type] || getHandler(msg.type);
        if (handler) await handler(client, msg);
      } catch (e) { logger.error('[WS] Message error:', e.message); }
    });

    ws.on('close', async () => {
      if (client.speaking) state.broadcast({ type: 'speaker_left', userId: clientId, user: client.username }, null, client.roomId);
      await leaveRoom(client, state);
      state.clients.delete(ws);
      state.broadcast({ type: 'user_left', userId: clientId }, null, client.roomId);
    });

    ws.send(pack({ type: 'connection_established', clientId, user: user ? { id: user.id, username: user.username, displayName: user.displayName } : null }));
  });

  return { pingInterval };
};

export { setupWebSocket, createClient };
