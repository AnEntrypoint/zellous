import { promises as fs } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { DATA_ROOT, ensureDir } from './storage-utils.js';
import { validators } from './validation.js';

const BOTS_DIR = join(DATA_ROOT, 'bots');

const ensureBotsDir = async () => ensureDir(BOTS_DIR);

const generateApiKey = () => `zb_${crypto.randomBytes(32).toString('hex')}`;

const hashApiKey = (key) => {
  return crypto.createHash('sha256').update(key).digest('hex');
};

const bots = {
  async create(name, ownerId, permissions = []) {
    await ensureBotsDir();

    const botId = crypto.randomBytes(8).toString('hex');
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    const bot = {
      id: botId,
      name,
      ownerId,
      apiKeyHash,
      permissions: permissions.length ? permissions : ['read', 'write', 'speak'],
      createdAt: Date.now(),
      lastUsedAt: null,
      webhookUrl: null,
      allowedRooms: [],
      metadata: {}
    };

    await fs.writeFile(
      join(BOTS_DIR, `${botId}.json`),
      JSON.stringify(bot, null, 2)
    );

    return { bot: { ...bot, apiKeyHash: undefined }, apiKey };
  },

  async findById(botId) {
    try {
      const data = await fs.readFile(join(BOTS_DIR, `${botId}.json`), 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  async findByApiKey(apiKey) {
    const validation = validators.apiKey(apiKey);
    if (!validation.valid) return null;

    await ensureBotsDir();
    const keyHash = hashApiKey(apiKey);

    try {
      const files = await fs.readdir(BOTS_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const bot = JSON.parse(await fs.readFile(join(BOTS_DIR, file), 'utf8'));
            if (bot.apiKeyHash === keyHash) {
              return bot;
            }
          } catch {}
        }
      }
    } catch {}
    return null;
  },

  async update(botId, updates) {
    const bot = await this.findById(botId);
    if (!bot) return null;
    Object.assign(bot, updates);
    await fs.writeFile(
      join(BOTS_DIR, `${botId}.json`),
      JSON.stringify(bot, null, 2)
    );
    return bot;
  },

  async delete(botId) {
    try {
      await fs.unlink(join(BOTS_DIR, `${botId}.json`));
      return true;
    } catch {
      return false;
    }
  },

  async listByOwner(ownerId) {
    await ensureBotsDir();
    const result = [];
    try {
      const files = await fs.readdir(BOTS_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const bot = JSON.parse(await fs.readFile(join(BOTS_DIR, file), 'utf8'));
            if (bot.ownerId === ownerId) {
              result.push({ ...bot, apiKeyHash: undefined });
            }
          } catch {}
        }
      }
    } catch {}
    return result;
  },

  async regenerateApiKey(botId) {
    const bot = await this.findById(botId);
    if (!bot) return null;

    const apiKey = generateApiKey();
    bot.apiKeyHash = hashApiKey(apiKey);
    await this.update(botId, { apiKeyHash: bot.apiKeyHash });

    return apiKey;
  },

  async setWebhook(botId, webhookUrl) {
    return this.update(botId, { webhookUrl });
  },

  async hasPermission(bot, permission) {
    return bot.permissions.includes(permission) || bot.permissions.includes('admin');
  },

  async canAccessRoom(bot, roomId) {
    if (bot.allowedRooms.length === 0) return true;
    return bot.allowedRooms.includes(roomId);
  },

  async touch(botId) {
    return this.update(botId, { lastUsedAt: Date.now() });
  }
};

export { bots, generateApiKey, hashApiKey };
