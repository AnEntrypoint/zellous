import { bots } from './bot-store.js';

const createHandlers = (connection) => ({
  auth: async (msg) => {
    const bot = await bots.findByApiKey(msg.apiKey);
    if (!bot) {
      connection.send({ type: 'auth_error', error: 'Invalid API key' });
      return;
    }

    connection.bot = bot;
    connection.clientId = `bot_${bot.id}`;
    await bots.touch(bot.id);

    connection.send({
      type: 'auth_success',
      botId: bot.id,
      name: bot.name
    });
  },

  join: async (msg) => {
    if (!connection.bot) {
      connection.send({ type: 'error', error: 'Authentication required' });
      return;
    }

    if (!await bots.canAccessRoom(connection.bot, msg.roomId)) {
      connection.send({ type: 'error', error: 'Room access denied' });
      return;
    }

    connection.roomId = msg.roomId || 'lobby';

    connection.serverState.clients.set(connection.ws, {
      id: connection.clientId,
      ws: connection.ws,
      username: `[Bot] ${connection.bot.name}`,
      speaking: false,
      roomId: connection.roomId,
      isBot: true,
      botId: connection.bot.id
    });

    const roomUsers = Array.from(connection.serverState.clients.values())
      .filter(c => c.roomId === connection.roomId && c !== connection.serverState.clients.get(connection.ws))
      .map(c => ({ id: c.id, username: c.username, isBot: c.isBot }));

    connection.send({
      type: 'joined',
      roomId: connection.roomId,
      users: roomUsers
    });

    connection.broadcast(
      { type: 'user_joined', user: `[Bot] ${connection.bot.name}`, userId: connection.clientId, isBot: true },
      connection.serverState.clients.get(connection.ws),
      connection.roomId
    );
  },

  leave: async () => {
    if (connection.roomId) {
      connection.broadcast(
        { type: 'user_left', userId: connection.clientId, isBot: true },
        connection.serverState.clients.get(connection.ws),
        connection.roomId
      );
      connection.roomId = null;
      connection.serverState.clients.delete(connection.ws);
    }
  },

  text: async (msg) => {
    if (!connection.roomId) {
      connection.send({ type: 'error', error: 'Not in a room' });
      return;
    }

    if (!await bots.hasPermission(connection.bot, 'write')) {
      connection.send({ type: 'error', error: 'Write permission required' });
      return;
    }

    connection.broadcast({
      type: 'text_message',
      userId: connection.clientId,
      username: `[Bot] ${connection.bot.name}`,
      content: msg.content,
      timestamp: Date.now(),
      isBot: true
    }, null, connection.roomId);
  },

  audio_start: async () => {
    if (!connection.roomId) {
      connection.send({ type: 'error', error: 'Not in a room' });
      return;
    }

    if (!await bots.hasPermission(connection.bot, 'speak')) {
      connection.send({ type: 'error', error: 'Speak permission required' });
      return;
    }

    const client = connection.serverState.clients.get(connection.ws);
    if (client) client.speaking = true;

    connection.broadcast({
      type: 'speaker_joined',
      user: `[Bot] ${connection.bot.name}`,
      userId: connection.clientId,
      isBot: true
    }, null, connection.roomId);
  },

  audio_chunk: async (msg) => {
    if (!connection.roomId) return;

    connection.broadcast({
      type: 'audio_data',
      userId: connection.clientId,
      data: msg.data,
      isBot: true
    }, connection.serverState.clients.get(connection.ws), connection.roomId);
  },

  audio_end: async () => {
    if (!connection.roomId) return;

    const client = connection.serverState.clients.get(connection.ws);
    if (client) client.speaking = false;

    connection.broadcast({
      type: 'speaker_left',
      userId: connection.clientId,
      user: `[Bot] ${connection.bot.name}`,
      isBot: true
    }, null, connection.roomId);
  },

  file: async (msg) => {
    if (!connection.roomId) {
      connection.send({ type: 'error', error: 'Not in a room' });
      return;
    }

    if (!await bots.hasPermission(connection.bot, 'write')) {
      connection.send({ type: 'error', error: 'Write permission required' });
      return;
    }

    connection.broadcast({
      type: 'file_shared',
      userId: connection.clientId,
      username: `[Bot] ${connection.bot.name}`,
      filename: msg.filename,
      size: msg.data?.length || 0,
      timestamp: Date.now(),
      isBot: true
    }, null, connection.roomId);
  }
});

export { createHandlers };
