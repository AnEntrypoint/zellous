import { bots } from './bot-store.js';

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

    this.serverState.clients.set(this.ws, {
      id: this.clientId,
      ws: this.ws,
      username: `[Bot] ${this.bot.name}`,
      speaking: false,
      roomId: this.roomId,
      isBot: true,
      botId: this.bot.id
    });

    const roomUsers = Array.from(this.serverState.clients.values())
      .filter(c => c.roomId === this.roomId && c !== this.serverState.clients.get(this.ws))
      .map(c => ({ id: c.id, username: c.username, isBot: c.isBot }));

    this.send({
      type: 'joined',
      roomId: this.roomId,
      users: roomUsers
    });

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

export { BotConnection };
