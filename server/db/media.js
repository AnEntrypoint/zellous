import { promises as fsp } from 'fs';
import { join } from 'path';

export const makeMedia = (ctx) => {
  const _ensured = new Set();
  return {
    async saveChunk(roomId, userId, type, chunk, sessionId) {
      const dir = join(ctx.dataRoot(), 'rooms', roomId, 'media', sessionId);
      if (!_ensured.has(dir)) { await fsp.mkdir(dir, { recursive: true }); _ensured.add(dir); }
      await fsp.appendFile(join(dir, type === 'audio' ? 'audio.opus' : 'video.webm'), Buffer.from(chunk));
    },

    async createSession(roomId, userId, username) {
      const sessionId = `${Date.now()}-${userId}`;
      const dir = join(ctx.dataRoot(), 'rooms', roomId, 'media', sessionId);
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(join(dir, 'meta.json'), JSON.stringify({ userId, username, startedAt: Date.now(), endedAt: null }, null, 2));
      return sessionId;
    },

    async endSession(roomId, sessionId) {
      try {
        const p = join(ctx.dataRoot(), 'rooms', roomId, 'media', sessionId, 'meta.json');
        const m = JSON.parse(await fsp.readFile(p, 'utf8'));
        m.endedAt = Date.now();
        await fsp.writeFile(p, JSON.stringify(m, null, 2));
      } catch {}
    },
  };
};
