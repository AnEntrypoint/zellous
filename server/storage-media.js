import { promises as fs } from 'fs';
import { join } from 'path';
import { DATA_ROOT, ensureDir } from './storage-utils.js';
import { rooms } from './storage-rooms.js';

const media = {
  async saveChunk(roomId, userId, type, chunk, sessionId) {
    await rooms.ensureRoom(roomId);
    const mediaDir = join(DATA_ROOT, 'rooms', roomId, 'media', sessionId);
    await ensureDir(mediaDir);

    const filename = type === 'audio' ? 'audio.opus' : 'video.webm';
    const filepath = join(mediaDir, filename);

    await fs.appendFile(filepath, Buffer.from(chunk));
    return filepath;
  },

  async createSession(roomId, userId, username) {
    const sessionId = `${Date.now()}-${userId}`;
    const mediaDir = join(DATA_ROOT, 'rooms', roomId, 'media', sessionId);
    await ensureDir(mediaDir);

    await fs.writeFile(
      join(mediaDir, 'meta.json'),
      JSON.stringify({
        userId,
        username,
        startedAt: Date.now(),
        endedAt: null
      }, null, 2)
    );

    return sessionId;
  },

  async endSession(roomId, sessionId) {
    const metaPath = join(DATA_ROOT, 'rooms', roomId, 'media', sessionId, 'meta.json');
    try {
      const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      meta.endedAt = Date.now();
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    } catch (e) {
      console.error(`[Storage] Failed to session meta.json read/write: ${e.message}`);
    }
  },

  async getSessionMedia(roomId, sessionId) {
    const mediaDir = join(DATA_ROOT, 'rooms', roomId, 'media', sessionId);
    const result = { audio: null, video: null, meta: null };

    try {
      result.meta = JSON.parse(await fs.readFile(join(mediaDir, 'meta.json'), 'utf8'));
    } catch (e) {
      console.error(`[Storage] Failed to session meta.json read: ${e.message}`);
    }

    try {
      result.audio = await fs.readFile(join(mediaDir, 'audio.opus'));
    } catch (e) {
      console.error(`[Storage] Failed to audio.opus read: ${e.message}`);
    }

    try {
      result.video = await fs.readFile(join(mediaDir, 'video.webm'));
    } catch (e) {
      console.error(`[Storage] Failed to video.webm read: ${e.message}`);
    }

    return result;
  }
};

export { media };
