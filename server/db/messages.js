import { promises as fsp } from 'fs';
import { join } from 'path';
import { shortId } from './utils.js';

export const makeMessages = (ctx) => ({
  async save(roomId, message) {
    const timestamp = Date.now();
    const msgId = message.id || shortId();
    const msgData = { id: msgId, roomId, channelId: message.channelId || 'general', userId: message.userId, username: message.username, type: message.type || 'text', content: message.content, timestamp, metadata: message.metadata || {} };
    await fsp.writeFile(join(ctx.dataRoot(), 'rooms', roomId, 'messages', `${timestamp}-${msgId}.json`), JSON.stringify(msgData, null, 2));
    return msgData;
  },

  async getRecent(roomId, limit = 50, before = null, channelId = null) {
    const msgDir = join(ctx.dataRoot(), 'rooms', roomId, 'messages');
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
    const msgDir = join(ctx.dataRoot(), 'rooms', roomId, 'messages');
    try { for (const f of await fsp.readdir(msgDir)) { if (f.includes(messageId)) return JSON.parse(await fsp.readFile(join(msgDir, f), 'utf8')); } } catch {}
    return null;
  },

  async remove(roomId, messageId) {
    try { for (const f of await fsp.readdir(join(ctx.dataRoot(), 'rooms', roomId, 'messages'))) { if (f.includes(messageId)) { await fsp.unlink(join(ctx.dataRoot(), 'rooms', roomId, 'messages', f)); return true; } } } catch {}
    return false;
  },

  async update(roomId, messageId, updates) {
    const dir = join(ctx.dataRoot(), 'rooms', roomId, 'messages');
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
});
