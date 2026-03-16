import { generateId, shortId, hashPassword, verifyPassword, tryParse } from './utils.js';

export const makeUsers = (ctx) => ({
  async create(username, password, displayName = null) {
    const userId = generateId();
    const { salt, hash } = hashPassword(password);
    const r = await ctx.db().from('users').insert({
      id: userId, username: username.toLowerCase(), displayname: displayName || username,
      passwordsalt: salt, passwordhash: hash, createdat: Date.now(),
      lastloginat: 0, devices: '[]',
      settings: JSON.stringify({ volume: 0.7, vadEnabled: false, vadThreshold: 0.15 }),
    });
    if (r.error) throw new Error(r.error.message);
    await ctx.db().from('userindex').insert({ username: username.toLowerCase(), userid: userId });
    return { id: userId, username: username.toLowerCase(), displayName: displayName || username };
  },

  async findByUsername(username) {
    const idx = ctx.row(await ctx.db().from('userindex').select().eq('username', username.toLowerCase()).maybeSingle());
    if (!idx) return null;
    return this.findById(idx.userid);
  },

  async findById(userId) {
    const u = ctx.row(await ctx.db().from('users').select().eq('id', userId).maybeSingle());
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
    if (Object.keys(patch).length) await ctx.db().from('users').update(patch).eq('id', userId);
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
});
