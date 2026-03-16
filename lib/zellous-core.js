import { pack, unpack } from 'msgpackr';
import { EventEmitter } from 'events';
import { joinRoom, leaveRoom, filterClientsByRoom, getRoom, getAllRooms } from './room-manager.js';

export class ZellousCore extends EventEmitter {
  pack = pack;
  unpack = unpack;

  constructor(options = {}) {
    super();
    this.options = { dataRoot: './data', port: 3000, host: '0.0.0.0', enableAuth: true, enableBots: true, cleanupInterval: 600000, ...options };
    this.state = { clients: new Map(), counter: 0, roomUsers: new Map(), mediaSessions: new Map() };
    this.handlers = {};
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

  registerHandler(type, handler) { this.handlers[type] = handler; }
  unregisterHandler(type) { delete this.handlers[type]; }

  async handleMessage(client, msg) {
    const handler = this.handlers[msg.type];
    if (handler) {
      try { await handler(client, msg, this); } catch (e) { this.emit('error', { type: 'handler', messageType: msg.type, error: e, clientId: client.id }); }
    } else { this.emit('unknownMessage', { type: msg.type, clientId: client.id }); }
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
