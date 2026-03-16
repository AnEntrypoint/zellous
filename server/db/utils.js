import crypto from 'crypto';

const generateId = () => crypto.randomBytes(16).toString('hex');
const shortId = () => crypto.randomBytes(8).toString('hex');

const hashPassword = (pw) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(pw, salt, 10000, 64, 'sha512').toString('hex');
  return { salt, hash };
};

const verifyPassword = (pw, salt, hash) =>
  crypto.pbkdf2Sync(pw, salt, 10000, 64, 'sha512').toString('hex') === hash;

const API_KEY_PREFIX = 'zb_';
const generateApiKey = () => `${API_KEY_PREFIX}${crypto.randomBytes(32).toString('hex')}`;
const hashApiKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

const tryParse = (v, def) => {
  try { return typeof v === 'string' ? JSON.parse(v) : v ?? def; } catch { return def; }
};

export { generateId, shortId, hashPassword, verifyPassword, generateApiKey, hashApiKey, tryParse, API_KEY_PREFIX };
