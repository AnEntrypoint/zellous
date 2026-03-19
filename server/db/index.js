import { promises as fsp } from 'fs';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from '@sequentialos/sequential-logging';

import { makeUsers } from './users.js';
import { makeSessions } from './sessions.js';
import { makeRooms } from './rooms.js';
import { makeMessages } from './messages.js';
import { makeMedia } from './media.js';
import { makeFiles } from './files.js';
import { makeServers } from './servers.js';
import { makeBots } from './bots.js';

export { generateId, shortId, hashPassword, verifyPassword, generateApiKey, hashApiKey } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _db = null;
let _dataRoot = null;
let _config = null;
let _cleanupInterval = null;

const row = (r) => (Array.isArray(r?.data) ? r.data[0] : null) ?? r?.data ?? null;
const rows = (r) => Array.isArray(r?.data) ? r.data : [];

const ctx = {
  db: () => _db,
  config: () => _config,
  dataRoot: () => _dataRoot,
  row,
  rows,
};

export const users = makeUsers(ctx);
export const sessions = makeSessions(ctx);
export const rooms = makeRooms(ctx);
export const messages = makeMessages(ctx);
export const media = makeMedia(ctx);
export const files = makeFiles(ctx);
export const servers = makeServers(ctx);
export const bots = makeBots(ctx);

export const initialize = async (cfg = {}) => {
  _config = cfg;
  _dataRoot = cfg.dataDir
    ? (cfg.dataDir.startsWith('/') ? cfg.dataDir : join(__dirname, '..', '..', cfg.dataDir.replace(/^\.\//, '')))
    : join(__dirname, '..', '..', 'data');

  if (!existsSync(_dataRoot)) mkdirSync(_dataRoot, { recursive: true });
  if (!existsSync(join(_dataRoot, 'rooms'))) mkdirSync(join(_dataRoot, 'rooms'), { recursive: true });
  if (!existsSync(join(_dataRoot, 'servers'))) mkdirSync(join(_dataRoot, 'servers'), { recursive: true });

  if (cfg.busybaseUrl) {
    const { default: BB } = await import('busybase');
    _db = BB(cfg.busybaseUrl, cfg.busybaseKey || 'local');
  } else {
    const { createEmbedded } = await import('busybase/embedded');
    _db = await createEmbedded({ dir: join(_dataRoot, 'busybase') });
  }

  await servers.initialize();
  await cleanupOnStartup();
};

const cleanupOnStartup = async () => {
  await sessions.deleteExpired();
  await rooms.processCleanups();
  logger.info('[DB] Startup cleanup complete');
};

export const startCleanup = (intervalMs) => {
  if (_cleanupInterval) return;
  _cleanupInterval = setInterval(() => rooms.processCleanups(), Math.min(intervalMs || _config?.cleanupTimeout || 600000, 60000));
};

export const stopCleanup = () => {
  if (_cleanupInterval) { clearInterval(_cleanupInterval); _cleanupInterval = null; }
};

export const getDataRoot = () => _dataRoot;
