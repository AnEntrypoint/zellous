import { promises as fs } from 'fs';
import { join } from 'path';
import { DATA_ROOT, shortId, ensureDir } from './storage-utils.js';
import { rooms } from './storage-rooms.js';
import logger from '@sequentialos/sequential-logging';
import { nowISO, createTimestamps, updateTimestamp } from '@sequentialos/timestamp-utilities';

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
          } catch (e) {
            logger.error(`[Storage] Failed to meta.json parse in files list: ${e.message}`);
          }
        }
      }
    } catch (e) {
      logger.error(`[Storage] Failed to files directory read: ${e.message}`);
    }

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
        } catch (e) {
          logger.error(`[Storage] Failed to meta.json read in findFileRecursive: ${e.message}`);
        }
        return { filepath: fullPath, meta };
      }
    }
  } catch (e) {
    logger.error(`[Storage] Failed to directory read in findFileRecursive: ${e.message}`);
  }
  return null;
}

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

export { files };
