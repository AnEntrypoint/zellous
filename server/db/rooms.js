import { promises as fsp } from 'fs';
import { join } from 'path';
import { shortId, tryParse } from './utils.js';
import logger from '@sequentialos/sequential-logging';

const parseRoom = (r) => ({ ...r, userCount: r.usercount, createdAt: r.createdat, lastActivityAt: r.lastactivityat, channels: tryParse(r.channels, []), categories: tryParse(r.categories, []) });

export const makeRooms = (ctx) => ({
  async ensureRoom(roomId) {
    const existing = ctx.row(await ctx.db().from('rooms').select().eq('id', roomId).maybeSingle());
    if (existing) return parseRoom(existing);
    const cfg = ctx.config();
    const meta = { id: roomId, createdat: Date.now(), lastactivityat: Date.now(), usercount: 0, categories: JSON.stringify(cfg.defaultCategories || []), channels: JSON.stringify(cfg.defaultChannels || []) };
    await ctx.db().from('rooms').insert(meta);
    const dir = join(ctx.dataRoot(), 'rooms', roomId);
    await fsp.mkdir(join(dir, 'messages'), { recursive: true });
    await fsp.mkdir(join(dir, 'media'), { recursive: true });
    await fsp.mkdir(join(dir, 'files'), { recursive: true });
    return parseRoom(meta);
  },

  async getMeta(roomId) {
    const r = ctx.row(await ctx.db().from('rooms').select().eq('id', roomId).maybeSingle());
    return r ? parseRoom(r) : null;
  },

  async updateMeta(roomId, updates) {
    const patch = { lastactivityat: Date.now() };
    if (updates.userCount !== undefined) patch.usercount = updates.userCount;
    if (updates.channels !== undefined) patch.channels = typeof updates.channels === 'string' ? updates.channels : JSON.stringify(updates.channels);
    if (updates.categories !== undefined) patch.categories = typeof updates.categories === 'string' ? updates.categories : JSON.stringify(updates.categories);
    await ctx.db().from('rooms').update(patch).eq('id', roomId);
    return this.getMeta(roomId);
  },

  async setUserCount(roomId, count) { return this.updateMeta(roomId, { userCount: count }); },

  async scheduleCleanup(roomId) {
    const exp = Date.now() + (ctx.config().cleanupTimeout || 600000);
    const ex = ctx.row(await ctx.db().from('cleanups').select().eq('roomid', roomId).maybeSingle());
    if (ex) await ctx.db().from('cleanups').update({ exp }).eq('roomid', roomId);
    else await ctx.db().from('cleanups').insert({ roomid: roomId, exp });
  },

  async cancelCleanup(roomId) { await ctx.db().from('cleanups').delete().eq('roomid', roomId); },

  async processCleanups() {
    const now = Date.now();
    const due = ctx.rows(await ctx.db().from('cleanups').select().lte('exp', now));
    for (const entry of due) {
      await this.cleanup(entry.roomid);
      await ctx.db().from('cleanups').delete().eq('roomid', entry.roomid);
    }
  },

  async cleanup(roomId) {
    await ctx.db().from('rooms').delete().eq('id', roomId);
    try { await fsp.rm(join(ctx.dataRoot(), 'rooms', roomId), { recursive: true, force: true }); } catch {}
    logger.info(`[DB] Cleaned up room: ${roomId}`);
  },

  async getChannels(roomId) { return (await this.getMeta(roomId))?.channels || (ctx.config().defaultChannels || []); },
  async getCategories(roomId) { return (await this.getMeta(roomId))?.categories || (ctx.config().defaultCategories || []); },

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
});
