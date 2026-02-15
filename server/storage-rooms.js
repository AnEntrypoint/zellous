import { promises as fs } from 'fs';
import { join } from 'path';
import { DATA_ROOT, ensureDir, CLEANUP_TIMEOUT, shortId } from './storage-utils.js';
import logger from '@sequentialos/sequential-logging';
import { nowISO, createTimestamps, updateTimestamp } from '@sequentialos/timestamp-utilities';
import { delay, withRetry } from '@sequentialos/async-patterns';

const DEFAULT_CHANNELS = [
  { id: 'general', type: 'text', name: 'general' },
  { id: 'voice', type: 'voice', name: 'Voice Chat' },
  { id: 'queue', type: 'threaded', name: 'Audio Queue' }
];

const rooms = {
  async ensureRoom(roomId) {
    const roomDir = join(DATA_ROOT, 'rooms', roomId);
    await ensureDir(roomDir);
    await ensureDir(join(roomDir, 'messages'));
    await ensureDir(join(roomDir, 'media'));
    await ensureDir(join(roomDir, 'files'));

    const metaPath = join(roomDir, 'meta.json');
    let meta;
    try {
      meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      meta.lastActivityAt = Date.now();
      if (!meta.channels) meta.channels = [...DEFAULT_CHANNELS];
    } catch {
      meta = {
        id: roomId,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        userCount: 0,
        channels: [...DEFAULT_CHANNELS]
      };
    }
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
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
      logger.info(`[Storage] Cleaned up room: ${roomId}`);
    } catch (e) {
      logger.error(`[Storage] Failed to cleanup room ${roomId}:`, e.message);
    }
  },

  async getChannels(roomId) {
    const meta = await this.getMeta(roomId);
    return meta?.channels || [...DEFAULT_CHANNELS];
  },

  async addChannel(roomId, { name, type, permissions }) {
    const meta = await this.getMeta(roomId);
    if (!meta) return null;
    if (!meta.channels) meta.channels = [...DEFAULT_CHANNELS];
    const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') + '-' + shortId().slice(0, 4);
    const channel = { id, type: type || 'text', name, permissions: permissions || null };
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
    await this.updateMeta(roomId, { channels: meta.channels });
    return ch;
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
