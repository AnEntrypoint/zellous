import { createHandlers } from './bot-handlers.js';

class BotConnection {
  constructor(ws, broadcast, serverState) {
    this.ws = ws;
    this.broadcast = broadcast;
    this.serverState = serverState;
    this.bot = null;
    this.roomId = null;
    this.clientId = null;
    this.handlers = createHandlers(this);
  }

  send(msg) {
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  async handleMessage(data) {
    try {
      const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      const msg = JSON.parse(raw);
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

  async cleanup() {
    if (this.roomId) {
      await this.handlers.leave();
    }
  }
}

export { BotConnection };
