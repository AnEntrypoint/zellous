import { promises as fsp } from 'fs';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import logger from '@sequentialos/sequential-logging';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _db = null;
let _dataRoot = null;
let _config = null;
let _cleanupInterval = null;

const generateId = () => crypto.randomBytes(16).toString('hex');
const shortId = () => crypto.randomBytes(8).toString('hex');
const hashPassword = (pw) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(pw, salt, 10000, 64, 'sha512').toString('hex');
  return { salt, hash };
};
const verifyPassword = (pw, salt, hash) =>
  crypto.pbkdf2Sync(pw, salt, 10000, 64, 'sha512').toString('hex') === hash;

const ensureDir = async (dir) => { if (!existsSync(dir)) await fsp.mkdir(dir, { recursive: true }); };
const ensureDirSync = (dir) => { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); };

const getDb = () => _db;

const row = (r) => (Array.isArray(r?.data) ? r.data[0] : null) ?? r?.data ?? null;
const rows = (r) => Array.isArray(r?.data) ? r.data : [];
const tryParse = (v, def) => { try { return typeof v === 'string' ? JSON.parse(v) : v ?? def; } catch { return def; } };

const users = {
  async create(username, password, displayName = null) {
    const userId = generateId();
    const { salt, hash } = hashPassword(password);
    const r = await getDb().from('users').insert({
      id: userId, username: username.toLowerCase(), displayname: displayName || username,
      passwordsalt: salt, passwordhash: hash, createdat: Date.now(),
      lastloginat: 0, devices: '[]', settings: JSON.stringify({ volume: 0.7, vadEnabled: false, vadThreshold: 0.15 }),
    });
    if (r.error) throw new Error(r.error.message);
    await getDb().from('userindex').insert({ username: username.toLowerCase(), userid: userId });
    return { id: userId, username: username.toLowerCase(), displayName: displayName || username };
  },

  async findByUsername(username) {
    const idx = row(await getDb().from('userindex').select().eq('username', username.toLowerCase()).maybeSingle());
    if (!idx) return null;
    return this.findById(idx.userid);
  },

  async findById(userId) {
    const u = row(await getDb().from('users').select().eq('id', userId).maybeSingle());
    if (!u) return null;
    return { id: u.id, username: u.username, displayName: u.displayname, passwordSalt: u.passwordsalt, passwordHash: u.passwordhash, createdAt: u.createdat, lastLoginAt: u.lastloginat, devices: tryParse(u.devices, []), settings: tryParse(u.settings, {}) };
  },

  async update(userId, updates) {
    const patch = {};
    if (updates.displayName !== undefined) patch.displayname = updates.displayName;
    if (updates.passwordSalt !== undefined) patch.passwordsalt = updates.passwordSalt;
    if (updates.passwordHash !== undefined) patch.passwordhash = updates.passwordHash;
    if (updates.lastLoginAt !== undefined) patch.lastloginat = updates.lastLoginAt;
    if (updates.devices !== undefined) patch.devices = typeof updates.devices === 'string' ? updates.devices : JSON.stringify(updates.devices);
    if (updates.settings !== undefined) patch.settings = typeof updates.settings === 'string' ? updates.settings : JSON.stringify(updates.settings);
    if (Object.keys(patch).length) await getDb().from('users').update(patch).eq('id', userId);
    return this.findById(userId);
  },

  async authenticate(username, password) {
    const user = await this.findByUsername(username);
    if (!user) return null;
    if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) return null;
    await this.update(user.id, { lastLoginAt: Date.now() });
    return { id: user.id, username: user.username, displayName: user.displayName };
  },

  async addDevice(userId, deviceInfo) {
    const user = await this.findById(userId);
    if (!user) return null;
    const device = { id: shortId(), name: deviceInfo.name || 'Unknown Device', userAgent: deviceInfo.userAgent || '', lastSeenAt: Date.now(), createdAt: Date.now() };
    user.devices.push(device);
    await this.update(userId, { devices: user.devices });
    return device;
  },

  async getDevices(userId) { return (await this.findById(userId))?.devices || []; },

  async removeDevice(userId, deviceId) {
    const user = await this.findById(userId);
    if (!user) return false;
    await this.update(userId, { devices: user.devices.filter(d => d.id !== deviceId) });
    return true;
  },
};

const sessions = {
  async create(userId, deviceId = null) {
    const sessionId = generateId();
    await getDb().from('sessions').insert({
      id: sessionId, userid: userId, deviceid: deviceId || 'none',
      createdat: Date.now(), lastactivityat: Date.now(),
      expiresat: Date.now() + (_config?.sessionTtl || 7 * 24 * 60 * 60 * 1000),
    });
    return this.findById(sessionId);
  },

  _map: (s) => s ? { id: s.id, userId: s.userid, deviceId: s.deviceid, createdAt: s.createdat, lastActivityAt: s.lastactivityat, expiresAt: s.expiresat } : null,

  async findById(sessionId) {
    return this._map(row(await getDb().from('sessions').select().eq('id', sessionId).maybeSingle()));
  },

  async update(sessionId, updates) {
    const patch = {};
    if (updates.lastActivityAt !== undefined) patch.lastactivityat = updates.lastActivityAt;
    if (updates.expiresAt !== undefined) patch.expiresat = updates.expiresAt;
    if (Object.keys(patch).length) await getDb().from('sessions').update(patch).eq('id', sessionId);
    return this.findById(sessionId);
  },

  async touch(sessionId) { return this.update(sessionId, { lastActivityAt: Date.now() }); },

  async delete(sessionId) { await getDb().from('sessions').delete().eq('id', sessionId); return true; },

  async findByUserId(userId) {
    return rows(await getDb().from('sessions').select().eq('userid', userId)).map(this._map);
  },

  async validate(sessionId) {
    const session = await this.findById(sessionId);
    if (!session) return null;
    if (session.expiresAt < Date.now()) { await this.delete(sessionId); return null; }
    return session;
  },
};

const rooms = {
  async ensureRoom(roomId) {
    const existing = row(await getDb().from('rooms').select().eq('id', roomId).maybeSingle());
    if (existing) return parseRoom(existing);
    const meta = { id: roomId, createdat: Date.now(), lastactivityat: Date.now(), usercount: 0, categories: JSON.stringify(_config?.defaultCategories || []), channels: JSON.stringify(_config?.defaultChannels || []) };
    await getDb().from('rooms').insert(meta);
    await ensureDir(join(_dataRoot, 'rooms', roomId, 'messages'));
    await ensureDir(join(_dataRoot, 'rooms', roomId, 'media'));
    await ensureDir(join(_dataRoot, 'rooms', roomId, 'files'));
    return parseRoom(meta);
  },

  async getMeta(roomId) {
    const r = row(await getDb().from('rooms').select().eq('id', roomId).maybeSingle());
    return r ? parseRoom(r) : null;
  },

  async updateMeta(roomId, updates) {
    const patch = { lastactivityat: Date.now() };
    if (updates.userCount !== undefined) patch.usercount = updates.userCount;
    if (updates.channels !== undefined) patch.channels = typeof updates.channels === 'string' ? updates.channels : JSON.stringify(updates.channels);
    if (updates.categories !== undefined) patch.categories = typeof updates.categories === 'string' ? updates.categories : JSON.stringify(updates.categories);
    await getDb().from('rooms').update(patch).eq('id', roomId);
    return this.getMeta(roomId);
  },

  async setUserCount(roomId, count) { return this.updateMeta(roomId, { userCount: count }); },

  async scheduleCleanup(roomId) {
    const exp = Date.now() + (_config?.cleanupTimeout || 600000);
    const ex = row(await getDb().from('cleanups').select().eq('roomid', roomId).maybeSingle());
    if (ex) await getDb().from('cleanups').update({ exp }).eq('roomid', roomId);
    else await getDb().from('cleanups').insert({ roomid: roomId, exp });
  },

  async cancelCleanup(roomId) { await getDb().from('cleanups').delete().eq('roomid', roomId); },

  async processCleanups() {
    const now = Date.now();
    const due = rows(await getDb().from('cleanups').select().lte('exp', now));
    for (const entry of due) {
      await this.cleanup(entry.roomid);
      await getDb().from('cleanups').delete().eq('roomid', entry.roomid);
    }
  },

  async cleanup(roomId) {
    await getDb().from('rooms').delete().eq('id', roomId);
    try { await fsp.rm(join(_dataRoot, 'rooms', roomId), { recursive: true, force: true }); } catch {}
    logger.info(`[DB] Cleaned up room: ${roomId}`);
  },

  async getChannels(roomId) { return (await this.getMeta(roomId))?.channels || (_config?.defaultChannels || []); },
  async getCategories(roomId) { return (await this.getMeta(roomId))?.categories || (_config?.defaultCategories || []); },

  async addCategory(roomId, { name, position }) {
    const meta = await this.getMeta(roomId);
    if (!meta) return null;
    const cats = meta.categories || [];
    const maxPos = cats.reduce((m, c) => Math.max(m, c.position || 0), -1);
    const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') + '-' + shortId().slice(0, 4);
    const category = { id, name, position: position !== undefined ? position : maxPos + 1, collapsed: false };
    cats.push(category);
    await this.updateMeta(roomId, { categories: cats });
    return category;
  },

  async updateCategory(roomId, categoryId, updates) {
    const meta = await this.getMeta(roomId);
    if (!meta?.categories) return null;
    const cat = meta.categories.find(c => c.id === categoryId);
    if (!cat) return null;
    if (updates.name) cat.name = updates.name;
    if (updates.position !== undefined) cat.position = updates.position;
    if (updates.collapsed !== undefined) cat.collapsed = updates.collapsed;
    await this.updateMeta(roomId, { categories: meta.categories });
    return cat;
  },

  async deleteCategory(roomId, categoryId) {
    const meta = await this.getMeta(roomId);
    if (!meta?.categories) return false;
    const idx = meta.categories.findIndex(c => c.id === categoryId);
    if (idx === -1) return false;
    meta.categories.splice(idx, 1);
    if (meta.channels) meta.channels.forEach(ch => { if (ch.categoryId === categoryId) ch.categoryId = null; });
    await this.updateMeta(roomId, { categories: meta.categories, channels: meta.channels });
    return true;
  },

  async reorderCategories(roomId, orderedIds) {
    const meta = await this.getMeta(roomId);
    if (!meta?.categories) return null;
    orderedIds.forEach((id, idx) => { const cat = meta.categories.find(c => c.id === id); if (cat) cat.position = idx; });
    meta.categories.sort((a, b) => (a.position || 0) - (b.position || 0));
    await this.updateMeta(roomId, { categories: meta.categories });
    return meta.categories;
  },

  async addChannel(roomId, { name, type, permissions, categoryId, position }) {
    const meta = await this.getMeta(roomId);
    if (!meta) return null;
    const chs = meta.channels || [];
    const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') + '-' + shortId().slice(0, 4);
    const maxPos = chs.filter(c => c.categoryId === categoryId).reduce((m, c) => Math.max(m, c.position || 0), -1);
    const channel = { id, type: type || 'text', name, permissions: permissions || null, categoryId: categoryId || null, position: position !== undefined ? position : maxPos + 1 };
    chs.push(channel);
    await this.updateMeta(roomId, { channels: chs });
    return channel;
  },

  async updateChannel(roomId, channelId, updates) {
    const meta = await this.getMeta(roomId);
    if (!meta?.channels) return null;
    const ch = meta.channels.find(c => c.id === channelId);
    if (!ch) return null;
    if (updates.name) ch.name = updates.name;
    if (updates.permissions !== undefined) ch.permissions = updates.permissions;
    if (updates.categoryId !== undefined) ch.categoryId = updates.categoryId;
    if (updates.position !== undefined) ch.position = updates.position;
    await this.updateMeta(roomId, { channels: meta.channels });
    return ch;
  },

  async reorderChannels(roomId, categoryId, orderedIds) {
    const meta = await this.getMeta(roomId);
    if (!meta?.channels) return null;
    orderedIds.forEach((id, idx) => { const ch = meta.channels.find(c => c.id === id); if (ch) { ch.categoryId = categoryId; ch.position = idx; } });
    meta.channels.sort((a, b) => { const d = (a.categoryId || '').localeCompare(b.categoryId || ''); return d !== 0 ? d : (a.position || 0) - (b.position || 0); });
    await this.updateMeta(roomId, { channels: meta.channels });
    return meta.channels;
  },

  async deleteChannel(roomId, channelId) {
    const meta = await this.getMeta(roomId);
    if (!meta?.channels) return false;
    const idx = meta.channels.findIndex(c => c.id === channelId);
    if (idx === -1) return false;
    meta.channels.splice(idx, 1);
    await this.updateMeta(roomId, { channels: meta.channels });
    return true;
  },
};

const parseRoom = (r) => ({ ...r, userCount: r.usercount, createdAt: r.createdat, lastActivityAt: r.lastactivityat, channels: tryParse(r.channels, []), categories: tryParse(r.categories, []) });

const messages = {
  async save(roomId, message) {
    await rooms.ensureRoom(roomId);
    const timestamp = Date.now();
    const msgId = message.id || shortId();
    const msgData = { id: msgId, roomId, channelId: message.channelId || 'general', userId: message.userId, username: message.username, type: message.type || 'text', content: message.content, timestamp, metadata: message.metadata || {} };
    await fsp.writeFile(join(_dataRoot, 'rooms', roomId, 'messages', `${timestamp}-${msgId}.json`), JSON.stringify(msgData, null, 2));
    return msgData;
  },

  async getRecent(roomId, limit = 50, before = null, channelId = null) {
    const msgDir = join(_dataRoot, 'rooms', roomId, 'messages');
    try {
      let fileList = (await fsp.readdir(msgDir)).filter(f => f.endsWith('.json')).sort().reverse();
      if (before) fileList = fileList.filter(f => { const ts = parseInt(f.split('-')[0], 10); return !isNaN(ts) && ts < before; });
      const result = [];
      for (const file of fileList) {
        if (result.length >= limit) break;
        try { const msg = JSON.parse(await fsp.readFile(join(msgDir, file), 'utf8')); if (!channelId || (msg.channelId || 'general') === channelId) result.push(msg); } catch {}
      }
      return result.reverse();
    } catch { return []; }
  },

  async getById(roomId, messageId) {
    const msgDir = join(_dataRoot, 'rooms', roomId, 'messages');
    try { for (const f of await fsp.readdir(msgDir)) { if (f.includes(messageId)) return JSON.parse(await fsp.readFile(join(msgDir, f), 'utf8')); } } catch {}
    return null;
  },

  async remove(roomId, messageId) {
    try { for (const f of await fsp.readdir(join(_dataRoot, 'rooms', roomId, 'messages'))) { if (f.includes(messageId)) { await fsp.unlink(join(_dataRoot, 'rooms', roomId, 'messages', f)); return true; } } } catch {}
    return false;
  },

  async update(roomId, messageId, updates) {
    const dir = join(_dataRoot, 'rooms', roomId, 'messages');
    try {
      for (const f of await fsp.readdir(dir)) {
        if (f.includes(messageId)) {
          const msg = JSON.parse(await fsp.readFile(join(dir, f), 'utf8'));
          const updated = { ...msg, ...updates, edited: true, editedAt: Date.now() };
          await fsp.writeFile(join(dir, f), JSON.stringify(updated, null, 2));
          return updated;
        }
      }
    } catch {}
    return null;
  },
};

const media = {
  _ensured: new Set(),
  async saveChunk(roomId, userId, type, chunk, sessionId) {
    const dir = join(_dataRoot, 'rooms', roomId, 'media', sessionId);
    if (!this._ensured.has(dir)) { await ensureDir(dir); this._ensured.add(dir); }
    await fsp.appendFile(join(dir, type === 'audio' ? 'audio.opus' : 'video.webm'), Buffer.from(chunk));
  },
  async createSession(roomId, userId, username) {
    const sessionId = `${Date.now()}-${userId}`;
    const dir = join(_dataRoot, 'rooms', roomId, 'media', sessionId);
    await ensureDir(dir);
    await fsp.writeFile(join(dir, 'meta.json'), JSON.stringify({ userId, username, startedAt: Date.now(), endedAt: null }, null, 2));
    return sessionId;
  },
  async endSession(roomId, sessionId) {
    try { const p = join(_dataRoot, 'rooms', roomId, 'media', sessionId, 'meta.json'); const m = JSON.parse(await fsp.readFile(p, 'utf8')); m.endedAt = Date.now(); await fsp.writeFile(p, JSON.stringify(m, null, 2)); } catch {}
  },
};

const MIME_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', pdf: 'application/pdf', txt: 'text/plain', json: 'application/json', zip: 'application/zip' };
const guessMime = (fn) => MIME_TYPES[fn.split('.').pop()?.toLowerCase()] || 'application/octet-stream';

const files = {
  async save(roomId, userId, filename, data, customPath = '') {
    await rooms.ensureRoom(roomId);
    const fileDir = join(_dataRoot, 'rooms', roomId, 'files', customPath);
    await ensureDir(fileDir);
    const fileId = shortId();
    const safe = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storedName = `${fileId}-${safe}`;
    const filepath = join(fileDir, storedName);
    await fsp.writeFile(filepath, data);
    const meta = { id: fileId, originalName: filename, storedName, path: customPath, size: data.length, uploadedBy: userId, uploadedAt: Date.now(), mimeType: guessMime(filename) };
    await fsp.writeFile(`${filepath}.meta.json`, JSON.stringify(meta, null, 2));
    return meta;
  },
  async get(roomId, fileId) { return findFileRecursive(join(_dataRoot, 'rooms', roomId, 'files'), fileId); },
  async list(roomId, path = '') {
    const dir = join(_dataRoot, 'rooms', roomId, 'files', path);
    const result = [];
    try { for (const e of await fsp.readdir(dir, { withFileTypes: true })) { if (e.isDirectory()) result.push({ type: 'directory', name: e.name }); else if (e.name.endsWith('.meta.json')) { try { result.push({ type: 'file', ...JSON.parse(await fsp.readFile(join(dir, e.name), 'utf8')) }); } catch {} } } } catch {}
    return result;
  },
  async delete(roomId, fileId) {
    const f = await this.get(roomId, fileId);
    if (!f) return false;
    try { await fsp.unlink(f.filepath); await fsp.unlink(`${f.filepath}.meta.json`); return true; } catch { return false; }
  },
};

async function findFileRecursive(dir, fileId) {
  try {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      const fp = join(dir, e.name);
      if (e.isDirectory()) { const f = await findFileRecursive(fp, fileId); if (f) return f; }
      else if (e.name.startsWith(fileId) && !e.name.endsWith('.meta.json')) {
        let meta = null; try { meta = JSON.parse(await fsp.readFile(`${fp}.meta.json`, 'utf8')); } catch {}
        return { filepath: fp, meta };
      }
    }
  } catch {}
  return null;
}

const servers = {
  async initialize() {
    await ensureDir(join(_dataRoot, 'servers'));
    const ex = row(await getDb().from('serverindex').select().eq('id', '_init').maybeSingle());
    if (!ex) await getDb().from('serverindex').insert({ id: '_init', name: '', ownerid: '' });
  },

  async create({ name, ownerId, ownerName, iconColor }) {
    const id = shortId();
    await ensureDir(join(_dataRoot, 'servers', id));
    const meta = { id, name, iconColor: iconColor || '#5865f2', ownerId, createdAt: Date.now(), members: [{ userId: ownerId, username: ownerName, role: 'owner', joinedAt: Date.now() }] };
    await fsp.writeFile(join(_dataRoot, 'servers', id, 'meta.json'), JSON.stringify(meta, null, 2));
    await getDb().from('serverindex').insert({ id, name, ownerid: ownerId });
    return meta;
  },

  async getMeta(serverId) {
    try { return JSON.parse(await fsp.readFile(join(_dataRoot, 'servers', serverId, 'meta.json'), 'utf8')); } catch { return null; }
  },

  async updateMeta(serverId, updates) {
    const meta = await this.getMeta(serverId);
    if (!meta) return null;
    Object.assign(meta, updates);
    await fsp.writeFile(join(_dataRoot, 'servers', serverId, 'meta.json'), JSON.stringify(meta, null, 2));
    if (updates.name) await getDb().from('serverindex').update({ name: updates.name }).eq('id', serverId);
    return meta;
  },

  async remove(serverId) {
    try { await fsp.rm(join(_dataRoot, 'servers', serverId), { recursive: true, force: true }); await getDb().from('serverindex').delete().eq('id', serverId); return true; } catch { return false; }
  },

  async listAll() { return rows(await getDb().from('serverindex').select().neq('id', '_init')).map(r => ({ id: r.id, name: r.name, ownerId: r.ownerid })); },

  async listForUser(userId) {
    const all = await this.listAll();
    const metas = await Promise.all(all.map(s => this.getMeta(s.id)));
    return metas.filter(m => m?.members?.some(mb => mb.userId === userId)).map(m => ({ id: m.id, name: m.name, iconColor: m.iconColor, ownerId: m.ownerId, memberCount: m.members.length }));
  },

  async join(serverId, userId, username) {
    const meta = await this.getMeta(serverId);
    if (!meta || meta.bans?.includes(userId)) return meta ? null : null;
    if (meta.members.some(m => m.userId === userId)) return meta;
    meta.members.push({ userId, username, role: 'member', joinedAt: Date.now() });
    return this.updateMeta(serverId, { members: meta.members });
  },

  async leave(serverId, userId) {
    const meta = await this.getMeta(serverId);
    if (!meta || meta.ownerId === userId) return false;
    meta.members = meta.members.filter(m => m.userId !== userId);
    await this.updateMeta(serverId, { members: meta.members });
    return true;
  },

  async getMemberRole(serverId, userId) { return (await this.getMeta(serverId))?.members?.find(m => m.userId === userId)?.role || null; },

  async setMemberRole(serverId, userId, role) {
    const meta = await this.getMeta(serverId);
    if (!meta) return false;
    const member = meta.members.find(m => m.userId === userId);
    if (!member) return false;
    member.role = role;
    await this.updateMeta(serverId, { members: meta.members });
    return true;
  },
};

const API_KEY_PREFIX = 'zb_';
const hashApiKey = (key) => crypto.createHash('sha256').update(key).digest('hex');
const generateApiKey = () => `${API_KEY_PREFIX}${crypto.randomBytes(32).toString('hex')}`;

const bots = {
  async create(name, ownerId, permissions = []) {
    const botId = crypto.randomBytes(8).toString('hex');
    const apiKey = generateApiKey();
    const perms = permissions.length ? permissions : ['read', 'write', 'speak'];
    await getDb().from('bots').insert({ id: botId, name, ownerid: ownerId, apikeyhash: hashApiKey(apiKey), permissions: JSON.stringify(perms), createdat: Date.now(), lastusedat: 0, webhookurl: '', allowedrooms: '[]', metadata: '{}' });
    return { bot: { id: botId, name, ownerId, permissions: perms, createdAt: Date.now(), lastUsedAt: null, webhookUrl: null, allowedRooms: [] }, apiKey };
  },

  _map: (b) => b ? { id: b.id, name: b.name, ownerId: b.ownerid, apiKeyHash: b.apikeyhash, permissions: tryParse(b.permissions, []), createdAt: b.createdat, lastUsedAt: b.lastusedat, webhookUrl: b.webhookurl, allowedRooms: tryParse(b.allowedrooms, []), metadata: tryParse(b.metadata, {}) } : null,

  async findById(botId) { return this._map(row(await getDb().from('bots').select().eq('id', botId).maybeSingle())); },

  async findByApiKey(apiKey) {
    if (!apiKey?.startsWith(API_KEY_PREFIX)) return null;
    const keyHash = hashApiKey(apiKey);
    return this._map(row(await getDb().from('bots').select().eq('apikeyhash', keyHash).maybeSingle()));
  },

  async update(botId, updates) {
    const patch = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.permissions !== undefined) patch.permissions = JSON.stringify(updates.permissions);
    if (updates.allowedRooms !== undefined) patch.allowedrooms = JSON.stringify(updates.allowedRooms);
    if (updates.webhookUrl !== undefined) patch.webhookurl = updates.webhookUrl;
    if (updates.apiKeyHash !== undefined) patch.apikeyhash = updates.apiKeyHash;
    if (updates.lastUsedAt !== undefined) patch.lastusedat = updates.lastUsedAt;
    if (updates.metadata !== undefined) patch.metadata = JSON.stringify(updates.metadata);
    if (Object.keys(patch).length) await getDb().from('bots').update(patch).eq('id', botId);
    return this.findById(botId);
  },

  async delete(botId) { await getDb().from('bots').delete().eq('id', botId); return true; },

  async listByOwner(ownerId) {
    return rows(await getDb().from('bots').select().eq('ownerid', ownerId)).map(b => ({ ...this._map(b), apiKeyHash: undefined }));
  },

  async regenerateApiKey(botId) {
    const apiKey = generateApiKey();
    await this.update(botId, { apiKeyHash: hashApiKey(apiKey) });
    return apiKey;
  },

  async hasPermission(bot, permission) { return bot.permissions.includes(permission) || bot.permissions.includes('admin'); },
  async canAccessRoom(bot, roomId) { return bot.allowedRooms.length === 0 || bot.allowedRooms.includes(roomId); },
  async touch(botId) { return this.update(botId, { lastUsedAt: Date.now() }); },
};

const initialize = async (cfg = {}) => {
  _config = cfg;
  _dataRoot = cfg.dataDir ? (cfg.dataDir.startsWith('/') ? cfg.dataDir : join(__dirname, '..', cfg.dataDir.replace(/^\.\//, ''))) : join(__dirname, '..', 'data');

  ensureDirSync(_dataRoot);
  ensureDirSync(join(_dataRoot, 'rooms'));
  ensureDirSync(join(_dataRoot, 'servers'));

  if (cfg.busybaseUrl) {
    const { default: BB } = await import('busybase');
    _db = BB(cfg.busybaseUrl, cfg.busybaseKey || 'local');
  } else {
    const { createEmbedded } = await import('busybase/embedded');
    _db = await createEmbedded({ dir: join(_dataRoot, 'busybase') });
  }

  await servers.initialize();
  await cleanupOnStartup();
};

const cleanupOnStartup = async () => {
  const now = Date.now();
  const expired = rows(await getDb().from('sessions').select().lte('expiresat', now));
  for (const s of expired) { try { await getDb().from('sessions').delete().eq('id', s.id); } catch {} }
  await rooms.processCleanups();
  logger.info('[DB] Startup cleanup complete');
};

const startCleanup = (intervalMs) => {
  if (_cleanupInterval) return;
  _cleanupInterval = setInterval(() => rooms.processCleanups(), Math.min(intervalMs || _config?.cleanupTimeout || 600000, 60000));
};

const stopCleanup = () => {
  if (_cleanupInterval) { clearInterval(_cleanupInterval); _cleanupInterval = null; }
};

export { initialize, startCleanup, stopCleanup, users, sessions, rooms, messages, media, files, servers, bots, generateId, shortId, hashPassword, verifyPassword, generateApiKey, hashApiKey };
