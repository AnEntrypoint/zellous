import { promises as fs } from 'fs';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { delay, withRetry } from '@sequentialos/async-patterns';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = join(__dirname, '..', 'data');
const CLEANUP_TIMEOUT = 10 * 60 * 1000;

const ensureDir = async (dir) => {
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
};

const ensureDirSync = (dir) => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
};

const initStorage = async () => {
  await ensureDir(DATA_ROOT);
  await ensureDir(join(DATA_ROOT, 'users'));
  await ensureDir(join(DATA_ROOT, 'sessions'));
  await ensureDir(join(DATA_ROOT, 'rooms'));
};

const generateId = () => crypto.randomBytes(16).toString('hex');

const shortId = () => crypto.randomBytes(8).toString('hex');

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { salt, hash };
};

const verifyPassword = (password, salt, hash) => {
  const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return testHash === hash;
};

let cleanupInterval = null;

const startCleanupProcessor = (cleanupFn) => {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(cleanupFn, 60000);
};

const stopCleanupProcessor = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
};

export {
  DATA_ROOT,
  CLEANUP_TIMEOUT,
  ensureDir,
  ensureDirSync,
  initStorage,
  generateId,
  shortId,
  hashPassword,
  verifyPassword,
  startCleanupProcessor,
  stopCleanupProcessor
};
