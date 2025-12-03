import { promises as fs } from 'fs';
import { join } from 'path';
import { DATA_ROOT, generateId, shortId, hashPassword, verifyPassword } from './storage-utils.js';

const users = {
  async create(username, password, displayName = null) {
    const userId = generateId();
    const { salt, hash } = hashPassword(password);
    const user = {
      id: userId,
      username: username.toLowerCase(),
      displayName: displayName || username,
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: Date.now(),
      lastLoginAt: null,
      devices: [],
      settings: {
        volume: 0.7,
        vadEnabled: false,
        vadThreshold: 0.15
      }
    };
    await fs.writeFile(
      join(DATA_ROOT, 'users', `${userId}.json`),
      JSON.stringify(user, null, 2)
    );

    await this.updateUsernameIndex(username.toLowerCase(), userId);
    return { id: userId, username: user.username, displayName: user.displayName };
  },

  async updateUsernameIndex(username, userId) {
    const indexPath = join(DATA_ROOT, 'users', '_index.json');
    let index = {};
    try {
      index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
    } catch (e) {
      console.error(`[Storage] Failed to read username index: ${e.message}`);
    }
    index[username] = userId;
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  },

  async findByUsername(username) {
    const indexPath = join(DATA_ROOT, 'users', '_index.json');
    try {
      const index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
      const userId = index[username.toLowerCase()];
      if (userId) {
        return this.findById(userId);
      }
    } catch (e) {
      console.error(`[Storage] Failed to username index lookup: ${e.message}`);
    }
    return null;
  },

  async findById(userId) {
    try {
      const data = await fs.readFile(join(DATA_ROOT, 'users', `${userId}.json`), 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.error(`[Storage] Failed to read user ${userId}: ${e.message}`);
      return null;
    }
  },

  async update(userId, updates) {
    const user = await this.findById(userId);
    if (!user) return null;
    Object.assign(user, updates);
    await fs.writeFile(
      join(DATA_ROOT, 'users', `${userId}.json`),
      JSON.stringify(user, null, 2)
    );
    return user;
  },

  async authenticate(username, password) {
    const user = await this.findByUsername(username);
    if (!user) return null;
    if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return null;
    }
    await this.update(user.id, { lastLoginAt: Date.now() });
    return { id: user.id, username: user.username, displayName: user.displayName };
  },

  async addDevice(userId, deviceInfo) {
    const user = await this.findById(userId);
    if (!user) return null;
    const device = {
      id: shortId(),
      name: deviceInfo.name || 'Unknown Device',
      userAgent: deviceInfo.userAgent || '',
      lastSeenAt: Date.now(),
      createdAt: Date.now()
    };
    user.devices.push(device);
    await this.update(userId, { devices: user.devices });
    return device;
  },

  async getDevices(userId) {
    const user = await this.findById(userId);
    return user?.devices || [];
  },

  async removeDevice(userId, deviceId) {
    const user = await this.findById(userId);
    if (!user) return false;
    user.devices = user.devices.filter(d => d.id !== deviceId);
    await this.update(userId, { devices: user.devices });
    return true;
  }
};

export { users };
