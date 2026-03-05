import { promises as fs } from 'fs';
import { join } from 'path';
import { DATA_ROOT, ensureDir, CLEANUP_TIMEOUT, shortId } from './storage-utils.js';
import logger from '@sequentialos/sequential-logging';
import { nowISO, createTimestamps, updateTimestamp } from '@sequentialos/timestamp-utilities';
import { delay, withRetry } from '@sequentialos/async-patterns';

const DEFAULT_CATEGORIES = [
  { id: 'text-channels', name: 'Text Channels', position: 0, collapsed: false },
  { id: 'voice-channels', name: 'Voice Channels', position: 1, collapsed: false }
];

const DEFAULT_CHANNELS = [
  { id: 'general', type: 'text', name: 'general', categoryId: 'text-channels', position: 0 },
  { id: 'voice', type: 'voice', name: 'Voice Chat', categoryId: 'voice-channels', position: 0 },
  { id: 'queue', type: 'threaded', name: 'Audio Queue', categoryId: 'voice-channels', position: 1 }
];

const _ensuredRooms = new Set();

const rooms = {
  async ensureRoom(roomId) {
    if (_ensuredRooms.has(roomId)) return this.getMeta(roomId);

    const roomDir = join(DATA_ROOT, 'rooms', roomId);
    await ensureDir(roomDir);
    await ensureDir(join(roomDir, 'messages'));
    await ensureDir(join(roomDir, 'media'));
    await ensureDir(join(roomDir, 'files'));

    const metaPath = join(roomDir, 'meta.json');
    let meta;
    try {
      meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      if (!meta.channels) {
        meta.channels = [...DEFAULT_CHANNELS];
      }
      if (!meta.categories) {
        meta.categories = [...DEFAULT_CATEGORIES];
      }
      if (!meta.channels || !meta.categories) {
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
      }
    } catch {
      meta = {
        id: roomId,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        userCount: 0,
        categories: [...DEFAULT_CATEGORIES],
        channels: [...DEFAULT_CHANNELS]
      };
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    }
    _ensuredRooms.add(roomId);
    return meta;
  },

  async getMeta(roomId) {
    try {
      const data = await fs.readFile(join(DATA_ROOT, 'rooms', roomId, 'meta.json'), 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  async updateMeta(roomId, updates) {
    const meta = await this.getMeta(roomId);
    if (!meta) return null;
    Object.assign(meta, updates, { lastActivityAt: Date.now() });
    await fs.writeFile(
      join(DATA_ROOT, 'rooms', roomId, 'meta.json'),
      JSON.stringify(meta, null, 2)
    );
    return meta;
  },

  async setUserCount(roomId, count) {
    return this.updateMeta(roomId, { userCount: count });
  },

  async scheduleCleanup(roomId) {
    const cleanupPath = join(DATA_ROOT, 'cleanup.json');
    let cleanup = {};
    try {
      cleanup = JSON.parse(await fs.readFile(cleanupPath, 'utf8'));
    } catch (e) {
      logger.error(`[Storage] Failed to cleanup.json read for schedule: ${e.message}`);
    }
    cleanup[roomId] = Date.now() + CLEANUP_TIMEOUT;
    await fs.writeFile(cleanupPath, JSON.stringify(cleanup, null, 2));
  },

  async cancelCleanup(roomId) {
    const cleanupPath = join(DATA_ROOT, 'cleanup.json');
    try {
      const cleanup = JSON.parse(await fs.readFile(cleanupPath, 'utf8'));
      delete cleanup[roomId];
      await fs.writeFile(cleanupPath, JSON.stringify(cleanup, null, 2));
    } catch (e) {
      logger.error(`[Storage] Failed to cleanup.json read/write for cancel: ${e.message}`);
    }
  },

  async processCleanups() {
    const cleanupPath = join(DATA_ROOT, 'cleanup.json');
    try {
      const cleanup = JSON.parse(await fs.readFile(cleanupPath, 'utf8'));
      const now = Date.now();
      for (const [roomId, cleanupTime] of Object.entries(cleanup)) {
        if (cleanupTime <= now) {
          await this.cleanup(roomId);
          delete cleanup[roomId];
        }
      }
      await fs.writeFile(cleanupPath, JSON.stringify(cleanup, null, 2));
    } catch {}
  },

  async cleanup(roomId) {
    const roomDir = join(DATA_ROOT, 'rooms', roomId);
    try {
      await fs.rm(roomDir, { recursive: true, force: true });
      _ensuredRooms.delete(roomId);
      logger.info(`[Storage] Cleaned up room: ${roomId}`);
    } catch (e) {
      logger.error(`[Storage] Failed to cleanup room ${roomId}:`, e.message);
    }
  },

  async getChannels(roomId) {
    const meta = await this.getMeta(roomId);
    return meta?.channels || [...DEFAULT_CHANNELS];
  },

  async getCategories(roomId) {
    const meta = await this.getMeta(roomId);
    return meta?.categories || [...DEFAULT_CATEGORIES];
  },

  async addCategory(roomId, { name, position }) {
    const meta = await this.getMeta(roomId);
    if (!meta) return null;
    if (!meta.categories) meta.categories = [...DEFAULT_CATEGORIES];
    const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') + '-' + shortId().slice(0, 4);
    const maxPos = meta.categories.reduce((max, c) => Math.max(max, c.position || 0), -1);
    const category = { 
      id, 
      name, 
      position: position !== undefined ? position : maxPos + 1,
      collapsed: false 
    };
    meta.categories.push(category);
    await this.updateMeta(roomId, { categories: meta.categories });
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
    if (meta.channels) {
      meta.channels.forEach(ch => {
        if (ch.categoryId === categoryId) {
          ch.categoryId = null;
        }
      });
    }
    await this.updateMeta(roomId, { categories: meta.categories, channels: meta.channels });
    return true;
  },

  async reorderCategories(roomId, orderedIds) {
    const meta = await this.getMeta(roomId);
    if (!meta?.categories) return null;
    orderedIds.forEach((id, idx) => {
      const cat = meta.categories.find(c => c.id === id);
      if (cat) cat.position = idx;
    });
    meta.categories.sort((a, b) => (a.position || 0) - (b.position || 0));
    await this.updateMeta(roomId, { categories: meta.categories });
    return meta.categories;
  },

  async addChannel(roomId, { name, type, permissions, categoryId, position }) {
    const meta = await this.getMeta(roomId);
    if (!meta) return null;
    if (!meta.channels) meta.channels = [...DEFAULT_CHANNELS];
    const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') + '-' + shortId().slice(0, 4);
    const categoryChannels = meta.channels.filter(c => c.categoryId === categoryId);
    const maxPos = categoryChannels.reduce((max, c) => Math.max(max, c.position || 0), -1);
    const channel = { 
      id, 
      type: type || 'text', 
      name, 
      permissions: permissions || null,
      categoryId: categoryId || null,
      position: position !== undefined ? position : maxPos + 1
    };
    meta.channels.push(channel);
    await this.updateMeta(roomId, { channels: meta.channels });
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
    orderedIds.forEach((id, idx) => {
      const ch = meta.channels.find(c => c.id === id);
      if (ch) {
        ch.categoryId = categoryId;
        ch.position = idx;
      }
    });
    meta.channels.sort((a, b) => {
      const catDiff = (a.categoryId || '').localeCompare(b.categoryId || '');
      if (catDiff !== 0) return catDiff;
      return (a.position || 0) - (b.position || 0);
    });
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
  }
};

export { rooms };
