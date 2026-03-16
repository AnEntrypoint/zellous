import { pack, unpack } from 'msgpackr';
import { EventEmitter } from 'events';
import { joinRoom, leaveRoom, filterClientsByRoom, getRoom, getAllRooms } from './room-manager.js';

/**
 * ZellousCore — the central hub for a Zellous server instance.
 * Extends EventEmitter. All internal events are emitted on this object.
 *
 * @typedef {Object} ClientObject
 * @property {number} id - Client ID
 * @property {WebSocket} ws - WebSocket connection
 * @property {string} username - Display name
 * @property {string|null} userId - Authenticated user ID
 * @property {string|null} sessionId - Session ID
 * @property {boolean} speaking - Currently speaking audio
 * @property {string} roomId - Current room ID
 * @property {boolean} isBot - Is a bot connection
 * @property {boolean} isAuthenticated - Is authenticated
 * @property {Object} metadata - Arbitrary metadata
 */
export class ZellousCore extends EventEmitter {
  pack = pack;
  unpack = unpack;

  /**
   * @param {import('./index.js').ZellousOptions} [options={}]
   */
  constructor(options = {}) {
    super();
    this.options = { dataRoot: './data', port: 3000, host: '0.0.0.0', enableAuth: true, enableBots: true, cleanupInterval: 600000, ...options };
    this.state = { clients: new Map(), counter: 0, roomUsers: new Map(), mediaSessions: new Map() };
    this.handlers = {};
    this._middlewares = [];
    this.storage = null;
    this.auth = null;
    this.server = null;
    this.wss = null;
  }

  async initialize(storage, auth) {
    this.storage = storage;
    this.auth = auth;
    await this.storage.init();
    this.emit('initialized');
  }

  createClient(ws, id, user = null) {
    return { id, ws, username: user?.displayName || `User${id}`, userId: user?.id || null, sessionId: null, speaking: false, roomId: 'lobby', isBot: false, isAuthenticated: !!user, metadata: {} };
  }

  broadcast(msg, exclude = null, roomId = null) {
    const data = pack(msg);
    const clients = roomId ? filterClientsByRoom(this, roomId, exclude) : Array.from(this.state.clients.values()).filter(c => c !== exclude);
    for (const client of clients) {
      if (client.ws.readyState === 1) {
        try { client.ws.send(data); } catch (e) { this.emit('error', { type: 'broadcast', error: e, clientId: client.id }); }
      }
    }
  }

  async joinRoom(client, roomId) { return joinRoom(this, client, roomId); }
  async leaveRoom(client) { return leaveRoom(this, client); }
  filterClientsByRoom(roomId, exclude = null) { return filterClientsByRoom(this, roomId, exclude); }
  getRoom(roomId) { return getRoom(this, roomId); }
  getAllRooms() { return getAllRooms(this); }

  registerHandler(type, handler) { this.handlers[type] = handler; return this; }
  unregisterHandler(type) { delete this.handlers[type]; return this; }

  /**
   * Register a message middleware (fluent).
   * @param {function(Object, Object, function): Promise<void>} fn
   * @returns {ZellousCore}
   */
  use(fn) {
    if (!this._middlewares) this._middlewares = [];
    this._middlewares.push(fn);
    return this;
  }

  /**
   * Register a plugin (fluent).
   * @param {function(ZellousCore): void} fn
   * @returns {ZellousCore}
   */
  plugin(fn) {
    fn(this);
    return this;
  }

  async handleMessage(client, msg) {
    const handler = this.handlers[msg.type];
    if (!handler) { this.emit('unknownMessage', { type: msg.type, clientId: client.id }); return; }
    const middlewares = this._middlewares || [];
    let i = 0;
    const next = async () => {
      if (i < middlewares.length) {
        const fn = middlewares[i++];
        try { await fn(client, msg, next); } catch (e) { this.emit('error', { type: 'middleware', error: e, clientId: client.id }); }
      } else {
        try { await handler(client, msg, this); } catch (e) { this.emit('error', { type: 'handler', messageType: msg.type, error: e, clientId: client.id }); }
      }
    };
    await next();
  }

  async handleConnection(ws, req) {
    const clientId = ++this.state.counter;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    let user = null;
    if (token && this.auth) { const r = await this.auth.authenticateWebSocket(token); if (r) user = r.user; }
    const client = this.createClient(ws, clientId, user);
    this.state.clients.set(ws, client);
    this.emit('clientConnected', { clientId, userId: user?.id, username: client.username, isAuthenticated: !!user });

    ws.on('message', async (data) => {
      try { const msg = unpack(Buffer.isBuffer(data) ? data : Buffer.from(data)); await this.handleMessage(client, msg); }
      catch (e) { this.emit('error', { type: 'message', error: e, clientId }); }
    });

    ws.on('close', async () => {
      await this.leaveRoom(client);
      this.state.clients.delete(ws);
      this.broadcast({ type: 'user_left', userId: clientId }, null, client.roomId);
      this.emit('clientDisconnected', { clientId, roomId: client.roomId });
    });

    ws.send(pack({ type: 'connection_established', clientId, user: user ? { id: user.id, username: user.username, displayName: user.displayName } : null }));
    return client;
  }

  getClient(clientId) {
    for (const client of this.state.clients.values()) { if (client.id === clientId) return client; }
    return null;
  }

  async sendToClient(clientId, message) {
    const client = this.getClient(clientId);
    if (client?.ws.readyState === 1) { try { client.ws.send(pack(message)); return true; } catch (e) { this.emit('error', { type: 'sendToClient', error: e, clientId }); return false; } }
    return false;
  }

  async sendToRoom(roomId, message, exclude = null) { this.broadcast(message, exclude, roomId); }

  getStats() {
    return { totalClients: this.state.clients.size, totalRooms: this.state.roomUsers.size, rooms: this.getAllRooms(), mediaSessions: this.state.mediaSessions.size };
  }
}
