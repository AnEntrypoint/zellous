import { promises as fs } from 'fs';
import { join } from 'path';
import { DATA_ROOT, generateId } from './storage-utils.js';

const sessions = {
  async create(userId, deviceId = null) {
    const sessionId = generateId();
    const session = {
      id: sessionId,
      userId,
      deviceId,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000),
      activeConnections: []
    };
    await fs.writeFile(
      join(DATA_ROOT, 'sessions', `${sessionId}.json`),
      JSON.stringify(session, null, 2)
    );
    return session;
  },

  async findById(sessionId) {
    try {
      const data = await fs.readFile(join(DATA_ROOT, 'sessions', `${sessionId}.json`), 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  async update(sessionId, updates) {
    const session = await this.findById(sessionId);
    if (!session) return null;
    Object.assign(session, updates);
    await fs.writeFile(
      join(DATA_ROOT, 'sessions', `${sessionId}.json`),
      JSON.stringify(session, null, 2)
    );
    return session;
  },

  async touch(sessionId) {
    return this.update(sessionId, { lastActivityAt: Date.now() });
  },

  async delete(sessionId) {
    try {
      await fs.unlink(join(DATA_ROOT, 'sessions', `${sessionId}.json`));
      return true;
    } catch {
      return false;
    }
  },

  async findByUserId(userId) {
    const sessionsDir = join(DATA_ROOT, 'sessions');
    const sessions = [];
    try {
      const files = await fs.readdir(sessionsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const data = JSON.parse(await fs.readFile(join(sessionsDir, file), 'utf8'));
            if (data.userId === userId) {
              sessions.push(data);
            }
          } catch (e) {
            console.error(`[Storage] Failed to session parse in loop: ${e.message}`);
          }
        }
      }
    } catch (e) {
      console.error(`[Storage] Failed to sessions directory read: ${e.message}`);
    }
    return sessions;
  },

  async validate(sessionId) {
    const session = await this.findById(sessionId);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      await this.delete(sessionId);
      return null;
    }
    return session;
  }
};

export { sessions };
