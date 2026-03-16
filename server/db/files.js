import { promises as fsp } from 'fs';
import { join } from 'path';
import { shortId } from './utils.js';

const MIME_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', pdf: 'application/pdf', txt: 'text/plain', json: 'application/json', zip: 'application/zip' };
const guessMime = (fn) => MIME_TYPES[fn.split('.').pop()?.toLowerCase()] || 'application/octet-stream';

const findFileRecursive = async (dir, fileId) => {
  try {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      const fp = join(dir, e.name);
      if (e.isDirectory()) { const f = await findFileRecursive(fp, fileId); if (f) return f; }
      else if (e.name.startsWith(fileId) && !e.name.endsWith('.meta.json')) {
        let meta = null; try { meta = JSON.parse(await fsp.readFile(`${fp}.meta.json`, 'utf8')); } catch {}
        return { filepath: fp, meta };
      }
    }
  } catch {}
  return null;
};

export const makeFiles = (ctx) => ({
  async save(roomId, userId, filename, data, customPath = '') {
    const fileDir = join(ctx.dataRoot(), 'rooms', roomId, 'files', customPath);
    await fsp.mkdir(fileDir, { recursive: true });
    const fileId = shortId();
    const safe = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storedName = `${fileId}-${safe}`;
    const filepath = join(fileDir, storedName);
    await fsp.writeFile(filepath, data);
    const meta = { id: fileId, originalName: filename, storedName, path: customPath, size: data.length, uploadedBy: userId, uploadedAt: Date.now(), mimeType: guessMime(filename) };
    await fsp.writeFile(`${filepath}.meta.json`, JSON.stringify(meta, null, 2));
    return meta;
  },

  async get(roomId, fileId) { return findFileRecursive(join(ctx.dataRoot(), 'rooms', roomId, 'files'), fileId); },

  async list(roomId, path = '') {
    const dir = join(ctx.dataRoot(), 'rooms', roomId, 'files', path);
    const result = [];
    try { for (const e of await fsp.readdir(dir, { withFileTypes: true })) { if (e.isDirectory()) result.push({ type: 'directory', name: e.name }); else if (e.name.endsWith('.meta.json')) { try { result.push({ type: 'file', ...JSON.parse(await fsp.readFile(join(dir, e.name), 'utf8')) }); } catch {} } } } catch {}
    return result;
  },

  async delete(roomId, fileId) {
    const f = await this.get(roomId, fileId);
    if (!f) return false;
    try { await fsp.unlink(f.filepath); await fsp.unlink(`${f.filepath}.meta.json`); return true; } catch { return false; }
  },
});
