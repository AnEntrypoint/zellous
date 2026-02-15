import { promises as fs } from 'fs';
import { join } from 'path';
import { DATA_ROOT, ensureDir, shortId } from './storage-utils.js';
import logger from '@sequentialos/sequential-logging';

const SERVERS_DIR = join(DATA_ROOT, 'servers');

const servers = {
  async initialize() {
    await ensureDir(SERVERS_DIR);
    const indexPath = join(SERVERS_DIR, '_index.json');
    try { await fs.access(indexPath); } catch { await fs.writeFile(indexPath, '{}'); }
  },

  async create({ name, ownerId, ownerName, iconColor }) {
    const id = shortId();
    const serverDir = join(SERVERS_DIR, id);
    await ensureDir(serverDir);
    const meta = {
      id, name,
      iconColor: iconColor || '#5865f2',
      ownerId,
      createdAt: Date.now(),
      members: [{ userId: ownerId, username: ownerName, role: 'owner', joinedAt: Date.now() }]
    };
    await fs.writeFile(join(serverDir, 'meta.json'), JSON.stringify(meta, null, 2));
    await this._updateIndex(id, { name, ownerId });
    return meta;
  },

  async getMeta(serverId) {
    try {
      return JSON.parse(await fs.readFile(join(SERVERS_DIR, serverId, 'meta.json'), 'utf8'));
    } catch { return null; }
  },

  async updateMeta(serverId, updates) {
    const meta = await this.getMeta(serverId);
    if (!meta) return null;
    Object.assign(meta, updates);
    await fs.writeFile(join(SERVERS_DIR, serverId, 'meta.json'), JSON.stringify(meta, null, 2));
    if (updates.name) await this._updateIndex(serverId, { name: updates.name });
    return meta;
  },

  async remove(serverId) {
    try {
      await fs.rm(join(SERVERS_DIR, serverId), { recursive: true, force: true });
      await this._removeFromIndex(serverId);
      return true;
    } catch (e) {
      logger.error(`[Servers] Delete failed: ${e.message}`);
      return false;
    }
  },

  async listAll() {
    try {
      const index = JSON.parse(await fs.readFile(join(SERVERS_DIR, '_index.json'), 'utf8'));
      return Object.entries(index).map(([id, v]) => ({ id, ...v }));
    } catch { return []; }
  },

  async listForUser(userId) {
    const all = await this.listAll();
    const result = [];
    for (const s of all) {
      const meta = await this.getMeta(s.id);
      if (meta?.members?.some(m => m.userId === userId)) {
        result.push({ id: s.id, name: meta.name, iconColor: meta.iconColor, ownerId: meta.ownerId, memberCount: meta.members.length });
      }
    }
    return result;
  },

  async join(serverId, userId, username) {
    const meta = await this.getMeta(serverId);
    if (!meta) return null;
    if (meta.members.some(m => m.userId === userId)) return meta;
    if (meta.bans?.includes(userId)) return null;
    meta.members.push({ userId, username, role: 'member', joinedAt: Date.now() });
    await this.updateMeta(serverId, { members: meta.members });
    return meta;
  },

  async leave(serverId, userId) {
    const meta = await this.getMeta(serverId);
    if (!meta) return false;
    if (meta.ownerId === userId) return false;
    meta.members = meta.members.filter(m => m.userId !== userId);
    await this.updateMeta(serverId, { members: meta.members });
    return true;
  },

  async getMemberRole(serverId, userId) {
    const meta = await this.getMeta(serverId);
    const member = meta?.members?.find(m => m.userId === userId);
    return member?.role || null;
  },

  async setMemberRole(serverId, userId, role) {
    const meta = await this.getMeta(serverId);
    if (!meta) return false;
    const member = meta.members.find(m => m.userId === userId);
    if (!member) return false;
    member.role = role;
    await this.updateMeta(serverId, { members: meta.members });
    return true;
  },

  async _updateIndex(serverId, data) {
    const indexPath = join(SERVERS_DIR, '_index.json');
    let index = {};
    try { index = JSON.parse(await fs.readFile(indexPath, 'utf8')); } catch {}
    index[serverId] = { ...(index[serverId] || {}), ...data };
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  },

  async _removeFromIndex(serverId) {
    const indexPath = join(SERVERS_DIR, '_index.json');
    try {
      const index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
      delete index[serverId];
      await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
    } catch {}
  }
};

export { servers };
