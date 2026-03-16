const genId = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

const makeUsers = (store) => ({
  async create(username, password, displayName = null) {
    const id = genId();
    const user = { id, username: username.toLowerCase(), displayName: displayName || username, passwordSalt: 'mem', passwordHash: password, createdAt: Date.now(), lastLoginAt: 0, devices: [], settings: {} };
    store.users.set(id, user);
    store.userIndex.set(username.toLowerCase(), id);
    return { id, username: user.username, displayName: user.displayName };
  },
  async findByUsername(username) { const id = store.userIndex.get(username.toLowerCase()); return id ? store.users.get(id) || null : null; },
  async findById(id) { return store.users.get(id) || null; },
  async update(id, updates) { const user = store.users.get(id); if (!user) return null; Object.assign(user, updates); return user; },
  async authenticate(username, password) { const user = await this.findByUsername(username); if (!user || user.passwordHash !== password) return null; return { id: user.id, username: user.username, displayName: user.displayName }; },
  async addDevice(userId, deviceInfo) { const user = store.users.get(userId); if (!user) return null; const device = { id: genId(), name: deviceInfo.name || 'Device', createdAt: Date.now() }; user.devices.push(device); return device; },
  async getDevices(userId) { return store.users.get(userId)?.devices || []; },
  async removeDevice(userId, deviceId) { const user = store.users.get(userId); if (!user) return false; user.devices = user.devices.filter(d => d.id !== deviceId); return true; },
});

const makeSessions = (store) => ({
  async create(userId, deviceId = null) { const id = genId(); const s = { id, userId, deviceId, createdAt: Date.now(), lastActivityAt: Date.now(), expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 }; store.sessions.set(id, s); return s; },
  async findById(id) { return store.sessions.get(id) || null; },
  async update(id, updates) { const s = store.sessions.get(id); if (!s) return null; Object.assign(s, updates); return s; },
  async touch(id) { return this.update(id, { lastActivityAt: Date.now() }); },
  async delete(id) { store.sessions.delete(id); return true; },
  async findByUserId(userId) { return Array.from(store.sessions.values()).filter(s => s.userId === userId); },
  async validate(id) { const s = store.sessions.get(id); if (!s) return null; if (s.expiresAt < Date.now()) { store.sessions.delete(id); return null; } return s; },
});

const makeRooms = (store) => ({
  async ensureRoom(roomId) { if (!store.rooms.has(roomId)) store.rooms.set(roomId, { id: roomId, createdAt: Date.now(), lastActivityAt: Date.now(), userCount: 0, channels: [], categories: [] }); return store.rooms.get(roomId); },
  async getMeta(roomId) { return store.rooms.get(roomId) || null; },
  async updateMeta(roomId, updates) { const room = store.rooms.get(roomId); if (!room) return null; Object.assign(room, updates, { lastActivityAt: Date.now() }); return room; },
  async setUserCount(roomId, count) { return this.updateMeta(roomId, { userCount: count }); },
  async scheduleCleanup() {},
  async cancelCleanup() {},
  async processCleanups() {},
  async cleanup(roomId) { store.rooms.delete(roomId); },
  async getChannels(roomId) { return store.rooms.get(roomId)?.channels || []; },
  async getCategories(roomId) { return store.rooms.get(roomId)?.categories || []; },
});

const makeMessages = (store) => ({
  async save(roomId, message) { if (!store.messages.has(roomId)) store.messages.set(roomId, []); const msg = { id: genId(), roomId, channelId: message.channelId || 'general', ...message, timestamp: Date.now() }; store.messages.get(roomId).push(msg); return msg; },
  async getRecent(roomId, limit = 50, before = null, channelId = null) { return (store.messages.get(roomId) || []).filter(m => (!before || m.timestamp < before) && (!channelId || m.channelId === channelId)).slice(-limit); },
  async getById(roomId, msgId) { return (store.messages.get(roomId) || []).find(m => m.id === msgId) || null; },
  async remove(roomId, msgId) { const msgs = store.messages.get(roomId); if (!msgs) return false; const idx = msgs.findIndex(m => m.id === msgId); if (idx === -1) return false; msgs.splice(idx, 1); return true; },
  async update(roomId, msgId, updates) { const msg = await this.getById(roomId, msgId); if (!msg) return null; Object.assign(msg, updates, { edited: true, editedAt: Date.now() }); return msg; },
});

const makeMedia = (store) => ({
  async createSession(roomId, userId) { const id = `${Date.now()}-${userId}`; store.mediaSessions.set(id, { roomId, userId, startedAt: Date.now() }); return id; },
  async saveChunk() {},
  async endSession(roomId, sessionId) { const s = store.mediaSessions.get(sessionId); if (s) s.endedAt = Date.now(); },
});

const makeFiles = (store) => ({
  async save(roomId, userId, filename, data, path = '') { const id = genId(); const meta = { id, originalName: filename, storedName: `${id}-${filename}`, path, size: data.length, uploadedBy: userId, uploadedAt: Date.now(), mimeType: 'application/octet-stream' }; store.files.set(id, { meta, data }); return meta; },
  async get(roomId, fileId) { const f = store.files.get(fileId); return f ? { filepath: null, meta: f.meta, data: f.data } : null; },
  async list(roomId, path = '') { return Array.from(store.files.values()).filter(f => f.meta.path === path).map(f => ({ type: 'file', ...f.meta })); },
  async delete(roomId, fileId) { return store.files.delete(fileId); },
});

/**
 * Create an in-memory storage adapter implementing the full StorageAdapter interface.
 * Suitable for testing and development. Does not persist between restarts.
 * @returns {import('./storage-types.js').StorageAdapter}
 */
const createMemoryAdapter = () => {
  const store = { users: new Map(), userIndex: new Map(), sessions: new Map(), rooms: new Map(), messages: new Map(), mediaSessions: new Map(), files: new Map(), servers: new Map(), bots: new Map() };
  return {
    async init() {},
    users: makeUsers(store),
    sessions: makeSessions(store),
    rooms: makeRooms(store),
    messages: makeMessages(store),
    media: makeMedia(store),
    files: makeFiles(store),
    servers: {
      async initialize() {},
      async create(data) { const id = genId(); store.servers.set(id, { id, ...data, members: [] }); return store.servers.get(id); },
      async getMeta(id) { return store.servers.get(id) || null; },
      async listAll() { return Array.from(store.servers.values()); },
      async listForUser(userId) { return Array.from(store.servers.values()).filter(s => s.members?.some(m => m.userId === userId)); },
    },
    bots: {
      async create(name, ownerId) { const id = genId(); const apiKey = `zb_${genId()}`; store.bots.set(id, { id, name, ownerId, permissions: ['read', 'write', 'speak'], apiKey }); return { bot: store.bots.get(id), apiKey }; },
      async findById(id) { return store.bots.get(id) || null; },
      async findByApiKey(key) { return Array.from(store.bots.values()).find(b => b.apiKey === key) || null; },
      async hasPermission(bot, perm) { return bot.permissions?.includes(perm) || false; },
      async canAccessRoom() { return true; },
      async touch() {},
    },
    _store: store,
  };
};

export { createMemoryAdapter };
