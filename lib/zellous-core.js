import { pack, unpack } from 'msgpackr';
import { EventEmitter } from 'events';

export class ZellousCore extends EventEmitter {
  // Export pack/unpack for convenience
  pack = pack;
  unpack = unpack;
  constructor(options = {}) {
    super();
    
    this.options = {
      dataRoot: options.dataRoot || './data',
      port: options.port || 3000,
      host: options.host || '0.0.0.0',
      enableAuth: options.enableAuth !== false,
      enableBots: options.enableBots !== false,
      cleanupInterval: options.cleanupInterval || 600000, // 10 minutes
      ...options
    };

    this.state = {
      clients: new Map(),
      counter: 0,
      roomUsers: new Map(),
      mediaSessions: new Map()
    };

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
    return {
      id,
      ws,
      username: user?.displayName || `User${id}`,
      userId: user?.id || null,
      sessionId: null,
      speaking: false,
      roomId: 'lobby',
      isBot: false,
      isAuthenticated: !!user,
      metadata: {}
    };
  }

  broadcast(msg, exclude = null, roomId = null) {
    const data = pack(msg);
    for (const client of this.state.clients.values()) {
      if (client.ws.readyState === 1 && client !== exclude && (!roomId || client.roomId === roomId)) {
        try {
          client.ws.send(data);
        } catch (e) {
          this.emit('error', { type: 'broadcast', error: e, clientId: client.id });
        }
      }
    }
  }

  async joinRoom(client, roomId) {
    const oldRoomId = client.roomId;

    if (oldRoomId && this.state.roomUsers.has(oldRoomId)) {
      this.state.roomUsers.get(oldRoomId).delete(client.id);
      if (this.state.roomUsers.get(oldRoomId).size === 0) {
        this.state.roomUsers.delete(oldRoomId);
        await this.storage.rooms.scheduleCleanup(oldRoomId);
        this.emit('roomEmpty', { roomId: oldRoomId });
      }
    }

    client.roomId = roomId;
    if (!this.state.roomUsers.has(roomId)) {
      this.state.roomUsers.set(roomId, new Set());
      await this.storage.rooms.cancelCleanup(roomId);
      this.emit('roomCreated', { roomId });
    }
    this.state.roomUsers.get(roomId).add(client.id);

    await this.storage.rooms.ensureRoom(roomId);
    await this.storage.rooms.setUserCount(roomId, this.state.roomUsers.get(roomId).size);

    this.emit('userJoinedRoom', { 
      userId: client.id, 
      username: client.username, 
      roomId, 
      userCount: this.state.roomUsers.get(roomId).size 
    });

    return roomId;
  }

  async leaveRoom(client) {
    const roomId = client.roomId;
    if (roomId && this.state.roomUsers.has(roomId)) {
      this.state.roomUsers.get(roomId).delete(client.id);
      const count = this.state.roomUsers.get(roomId).size;
      await this.storage.rooms.setUserCount(roomId, count);

      this.emit('userLeftRoom', { userId: client.id, roomId, userCount: count });

      if (count === 0) {
        this.state.roomUsers.delete(roomId);
        await this.storage.rooms.scheduleCleanup(roomId);
        this.emit('roomEmpty', { roomId });
      }
    }
  }

  registerHandler(type, handler) {
    this.handlers[type] = handler;
  }

  unregisterHandler(type) {
    delete this.handlers[type];
  }

  async handleMessage(client, msg) {
    const handler = this.handlers[msg.type];
    if (handler) {
      try {
        await handler(client, msg, this);
      } catch (e) {
        this.emit('error', { type: 'handler', messageType: msg.type, error: e, clientId: client.id });
      }
    } else {
      this.emit('unknownMessage', { type: msg.type, clientId: client.id });
    }
  }

  async handleConnection(ws, req) {
    const clientId = ++this.state.counter;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    let user = null;
    if (token && this.auth) {
      const authResult = await this.auth.authenticateWebSocket(token);
      if (authResult) {
        user = authResult.user;
      }
    }

    const client = this.createClient(ws, clientId, user);
    this.state.clients.set(ws, client);

    this.emit('clientConnected', { 
      clientId, 
      userId: user?.id, 
      username: client.username, 
      isAuthenticated: !!user 
    });

    ws.on('message', async (data) => {
      try {
        const msg = unpack(Buffer.isBuffer(data) ? data : Buffer.from(data));
        await this.handleMessage(client, msg);
      } catch (e) {
        this.emit('error', { type: 'message', error: e, clientId });
      }
    });

    ws.on('close', async () => {
      await this.leaveRoom(client);
      this.state.clients.delete(ws);
      this.broadcast({
        type: 'user_left',
        userId: clientId
      }, null, client.roomId);
      
      this.emit('clientDisconnected', { clientId, roomId: client.roomId });
    });

    ws.send(pack({
      type: 'connection_established',
      clientId,
      user: user ? { id: user.id, username: user.username, displayName: user.displayName } : null
    }));

    return client;
  }

  getRoom(roomId) {
    const users = Array.from(this.state.clients.values())
      .filter(c => c.roomId === roomId);
    
    return {
      id: roomId,
      users: users.map(u => ({
        id: u.id,
        username: u.username,
        speaking: u.speaking,
        isBot: u.isBot,
        isAuthenticated: u.isAuthenticated
      })),
      userCount: users.length
    };
  }

  getAllRooms() {
    const rooms = [];
    for (const [roomId, users] of this.state.roomUsers.entries()) {
      rooms.push({
        id: roomId,
        userCount: users.size
      });
    }
    return rooms;
  }

  getClient(clientId) {
    for (const client of this.state.clients.values()) {
      if (client.id === clientId) {
        return client;
      }
    }
    return null;
  }

  async sendToClient(clientId, message) {
    const client = this.getClient(clientId);
    if (client && client.ws.readyState === 1) {
      try {
        client.ws.send(pack(message));
        return true;
      } catch (e) {
        this.emit('error', { type: 'sendToClient', error: e, clientId });
        return false;
      }
    }
    return false;
  }

  async sendToRoom(roomId, message, exclude = null) {
    this.broadcast(message, exclude, roomId);
  }

  getStats() {
    return {
      totalClients: this.state.clients.size,
      totalRooms: this.state.roomUsers.size,
      rooms: this.getAllRooms(),
      mediaSessions: this.state.mediaSessions.size
    };
  }
}

export default ZellousCore;
