import { promises as fs } from 'fs';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = join(__dirname, '..', 'data');

// Data directory structure:
// data/
//   users/                    - User accounts
//     {userId}.json          - User profile & auth
//   sessions/                 - Active sessions
//     {sessionId}.json       - Session data with devices
//   rooms/                    - Room data & artifacts
//     {roomId}/
//       meta.json            - Room metadata
//       messages/            - Text messages band
//         {timestamp}-{id}.json
//       media/               - Media band (audio/video chunks)
//         {timestamp}-{userId}/
//           audio.opus
//           video.webm
//       files/               - Files band (user uploads)
//         {customPath}/      - User-defined structure
//           {filename}
//   cleanup.json             - Tracks rooms for cleanup

const CLEANUP_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Ensure directory exists
const ensureDir = async (dir) => {
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
};

// Ensure sync directory exists
const ensureDirSync = (dir) => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
};

// Initialize data directories
const initStorage = async () => {
  await ensureDir(DATA_ROOT);
  await ensureDir(join(DATA_ROOT, 'users'));
  await ensureDir(join(DATA_ROOT, 'sessions'));
  await ensureDir(join(DATA_ROOT, 'rooms'));

  // Cleanup stale data on startup
  await cleanupOnStartup();
};

// Generate unique ID
const generateId = () => crypto.randomBytes(16).toString('hex');

// Generate short ID
const shortId = () => crypto.randomBytes(8).toString('hex');

// Hash password
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { salt, hash };
};

// Verify password
const verifyPassword = (password, salt, hash) => {
  const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return testHash === hash;
};

// ==================== USER STORAGE ====================

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

    // Create username index
    await this.updateUsernameIndex(username.toLowerCase(), userId);

    return { id: userId, username: user.username, displayName: user.displayName };
  },

  async updateUsernameIndex(username, userId) {
    const indexPath = join(DATA_ROOT, 'users', '_index.json');
    let index = {};
    try {
      index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
    } catch {}
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
    } catch {}
    return null;
  },

  async findById(userId) {
    try {
      const data = await fs.readFile(join(DATA_ROOT, 'users', `${userId}.json`), 'utf8');
      return JSON.parse(data);
    } catch {
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

// ==================== SESSION STORAGE ====================

const sessions = {
  async create(userId, deviceId = null) {
    const sessionId = generateId();
    const session = {
      id: sessionId,
      userId,
      deviceId,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
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
          } catch {}
        }
      }
    } catch {}
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

// ==================== ROOM STORAGE ====================

const rooms = {
  async ensureRoom(roomId) {
    const roomDir = join(DATA_ROOT, 'rooms', roomId);
    await ensureDir(roomDir);
    await ensureDir(join(roomDir, 'messages'));
    await ensureDir(join(roomDir, 'media'));
    await ensureDir(join(roomDir, 'files'));

    // Create/update room meta
    const metaPath = join(roomDir, 'meta.json');
    let meta;
    try {
      meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      meta.lastActivityAt = Date.now();
    } catch {
      meta = {
        id: roomId,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        userCount: 0
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

  // Schedule room for cleanup when empty
  async scheduleCleanup(roomId) {
    const cleanupPath = join(DATA_ROOT, 'cleanup.json');
    let cleanup = {};
    try {
      cleanup = JSON.parse(await fs.readFile(cleanupPath, 'utf8'));
    } catch {}
    cleanup[roomId] = Date.now() + CLEANUP_TIMEOUT;
    await fs.writeFile(cleanupPath, JSON.stringify(cleanup, null, 2));
  },

  // Cancel cleanup when users rejoin
  async cancelCleanup(roomId) {
    const cleanupPath = join(DATA_ROOT, 'cleanup.json');
    try {
      const cleanup = JSON.parse(await fs.readFile(cleanupPath, 'utf8'));
      delete cleanup[roomId];
      await fs.writeFile(cleanupPath, JSON.stringify(cleanup, null, 2));
    } catch {}
  },

  // Check and execute pending cleanups
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

  // Clean up room data
  async cleanup(roomId) {
    const roomDir = join(DATA_ROOT, 'rooms', roomId);
    try {
      await fs.rm(roomDir, { recursive: true, force: true });
      console.log(`[Storage] Cleaned up room: ${roomId}`);
    } catch (e) {
      console.error(`[Storage] Failed to cleanup room ${roomId}:`, e.message);
    }
  }
};

// ==================== MESSAGE STORAGE ====================

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
      type: message.type || 'text', // text, audio, video, file, image
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
        } catch {}
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
    } catch {}
    return null;
  }
};

// ==================== MEDIA STORAGE ====================

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

    // Save session metadata
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
    } catch {}
  },

  async getSessionMedia(roomId, sessionId) {
    const mediaDir = join(DATA_ROOT, 'rooms', roomId, 'media', sessionId);
    const result = { audio: null, video: null, meta: null };

    try {
      result.meta = JSON.parse(await fs.readFile(join(mediaDir, 'meta.json'), 'utf8'));
    } catch {}

    try {
      result.audio = await fs.readFile(join(mediaDir, 'audio.opus'));
    } catch {}

    try {
      result.video = await fs.readFile(join(mediaDir, 'video.webm'));
    } catch {}

    return result;
  }
};

// ==================== FILE STORAGE ====================

const files = {
  async save(roomId, userId, filename, data, customPath = '') {
    await rooms.ensureRoom(roomId);
    const fileDir = join(DATA_ROOT, 'rooms', roomId, 'files', customPath);
    await ensureDir(fileDir);

    const fileId = shortId();
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storedName = `${fileId}-${safeFilename}`;
    const filepath = join(fileDir, storedName);

    await fs.writeFile(filepath, data);

    // Save file metadata
    const meta = {
      id: fileId,
      originalName: filename,
      storedName,
      path: customPath,
      size: data.length,
      uploadedBy: userId,
      uploadedAt: Date.now(),
      mimeType: guessMimeType(filename)
    };

    await fs.writeFile(
      join(fileDir, `${storedName}.meta.json`),
      JSON.stringify(meta, null, 2)
    );

    return meta;
  },

  async get(roomId, fileId) {
    const filesDir = join(DATA_ROOT, 'rooms', roomId, 'files');
    return findFileRecursive(filesDir, fileId);
  },

  async list(roomId, path = '') {
    const filesDir = join(DATA_ROOT, 'rooms', roomId, 'files', path);
    const result = [];

    try {
      const entries = await fs.readdir(filesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          result.push({ type: 'directory', name: entry.name });
        } else if (entry.name.endsWith('.meta.json')) {
          try {
            const meta = JSON.parse(await fs.readFile(join(filesDir, entry.name), 'utf8'));
            result.push({ type: 'file', ...meta });
          } catch {}
        }
      }
    } catch {}

    return result;
  },

  async delete(roomId, fileId) {
    const file = await this.get(roomId, fileId);
    if (!file) return false;

    try {
      await fs.unlink(file.filepath);
      await fs.unlink(`${file.filepath}.meta.json`);
      return true;
    } catch {
      return false;
    }
  }
};

// Helper to find file by ID recursively
async function findFileRecursive(dir, fileId) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = await findFileRecursive(fullPath, fileId);
        if (found) return found;
      } else if (entry.name.startsWith(fileId) && !entry.name.endsWith('.meta.json')) {
        const metaPath = `${fullPath}.meta.json`;
        let meta = null;
        try {
          meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
        } catch {}
        return { filepath: fullPath, meta };
      }
    }
  } catch {}
  return null;
}

// Guess MIME type from filename
function guessMimeType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
    'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
    'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
    'mp4': 'video/mp4', 'webm': 'video/webm', 'mov': 'video/quicktime',
    'pdf': 'application/pdf', 'txt': 'text/plain', 'json': 'application/json',
    'zip': 'application/zip', 'tar': 'application/x-tar'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// ==================== CLEANUP ON STARTUP ====================

async function cleanupOnStartup() {
  console.log('[Storage] Running startup cleanup...');

  // Process any pending room cleanups that should have happened
  const cleanupPath = join(DATA_ROOT, 'cleanup.json');
  try {
    const cleanup = JSON.parse(await fs.readFile(cleanupPath, 'utf8'));
    // Clean up any rooms that were scheduled (server was down)
    for (const [roomId, cleanupTime] of Object.entries(cleanup)) {
      await rooms.cleanup(roomId);
    }
    await fs.writeFile(cleanupPath, '{}');
  } catch {}

  // Clean up expired sessions
  const sessionsDir = join(DATA_ROOT, 'sessions');
  try {
    const files = await fs.readdir(sessionsDir);
    const now = Date.now();
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const session = JSON.parse(await fs.readFile(join(sessionsDir, file), 'utf8'));
          if (session.expiresAt < now) {
            await fs.unlink(join(sessionsDir, file));
            console.log(`[Storage] Cleaned expired session: ${session.id}`);
          }
        } catch {}
      }
    }
  } catch {}

  console.log('[Storage] Startup cleanup complete');
}

// Start periodic cleanup processor
let cleanupInterval = null;
const startCleanupProcessor = () => {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => rooms.processCleanups(), 60000); // Check every minute
};

const stopCleanupProcessor = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
};

export {
  initStorage,
  generateId,
  shortId,
  users,
  sessions,
  rooms,
  messages,
  media,
  files,
  startCleanupProcessor,
  stopCleanupProcessor,
  DATA_ROOT
};
