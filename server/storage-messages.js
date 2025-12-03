import { promises as fs } from 'fs';
import { join } from 'path';
import { DATA_ROOT, shortId } from './storage-utils.js';
import { rooms } from './storage-rooms.js';
import logger from '@sequential/sequential-logging';
import { nowISO, createTimestamps, updateTimestamp } from '@sequential/timestamp-utilities';

const messages = {
  async save(roomId, message) {
    await rooms.ensureRoom(roomId);
    const timestamp = Date.now();
    const msgId = message.id || shortId();
    const msgData = {
      id: msgId,
      roomId,
      userId: message.userId,
      username: message.username,
      type: message.type || 'text',
      content: message.content,
      timestamp,
      metadata: message.metadata || {}
    };

    const filename = `${timestamp}-${msgId}.json`;
    await fs.writeFile(
      join(DATA_ROOT, 'rooms', roomId, 'messages', filename),
      JSON.stringify(msgData, null, 2)
    );
    return msgData;
  },

  async getRecent(roomId, limit = 50, before = null) {
    const msgDir = join(DATA_ROOT, 'rooms', roomId, 'messages');
    try {
      const files = (await fs.readdir(msgDir))
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse();

      const messages = [];
      for (const file of files) {
        if (messages.length >= limit) break;
        try {
          const data = JSON.parse(await fs.readFile(join(msgDir, file), 'utf8'));
          if (!before || data.timestamp < before) {
            messages.push(data);
          }
        } catch (e) {
          logger.error(`[Storage] Failed to message file parse in loop: ${e.message}`);
        }
      }
      return messages.reverse();
    } catch {
      return [];
    }
  },

  async getById(roomId, messageId) {
    const msgDir = join(DATA_ROOT, 'rooms', roomId, 'messages');
    try {
      const files = await fs.readdir(msgDir);
      for (const file of files) {
        if (file.includes(messageId)) {
          return JSON.parse(await fs.readFile(join(msgDir, file), 'utf8'));
        }
      }
    } catch (e) {
      logger.error(`[Storage] Failed to message directory read for getById: ${e.message}`);
    }
    return null;
  }
};

export { messages };
