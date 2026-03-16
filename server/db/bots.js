import { generateApiKey, hashApiKey, tryParse, API_KEY_PREFIX } from './utils.js';
import crypto from 'crypto';

const mapBot = (b) => b ? { id: b.id, name: b.name, ownerId: b.ownerid, apiKeyHash: b.apikeyhash, permissions: tryParse(b.permissions, []), createdAt: b.createdat, lastUsedAt: b.lastusedat, webhookUrl: b.webhookurl, allowedRooms: tryParse(b.allowedrooms, []), metadata: tryParse(b.metadata, {}) } : null;

export const makeBots = (ctx) => ({
  async create(name, ownerId, permissions = []) {
    const botId = crypto.randomBytes(8).toString('hex');
    const apiKey = generateApiKey();
    const perms = permissions.length ? permissions : ['read', 'write', 'speak'];
    await ctx.db().from('bots').insert({ id: botId, name, ownerid: ownerId, apikeyhash: hashApiKey(apiKey), permissions: JSON.stringify(perms), createdat: Date.now(), lastusedat: 0, webhookurl: '', allowedrooms: '[]', metadata: '{}' });
    return { bot: { id: botId, name, ownerId, permissions: perms, createdAt: Date.now(), lastUsedAt: null, webhookUrl: null, allowedRooms: [] }, apiKey };
  },

  async findById(botId) { return mapBot(ctx.row(await ctx.db().from('bots').select().eq('id', botId).maybeSingle())); },

  async findByApiKey(apiKey) {
    if (!apiKey?.startsWith(API_KEY_PREFIX)) return null;
    const keyHash = hashApiKey(apiKey);
    return mapBot(ctx.row(await ctx.db().from('bots').select().eq('apikeyhash', keyHash).maybeSingle()));
  },

  async update(botId, updates) {
    const patch = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.permissions !== undefined) patch.permissions = JSON.stringify(updates.permissions);
    if (updates.allowedRooms !== undefined) patch.allowedrooms = JSON.stringify(updates.allowedRooms);
    if (updates.webhookUrl !== undefined) patch.webhookurl = updates.webhookUrl;
    if (updates.apiKeyHash !== undefined) patch.apikeyhash = updates.apiKeyHash;
    if (updates.lastUsedAt !== undefined) patch.lastusedat = updates.lastUsedAt;
    if (updates.metadata !== undefined) patch.metadata = JSON.stringify(updates.metadata);
    if (Object.keys(patch).length) await ctx.db().from('bots').update(patch).eq('id', botId);
    return this.findById(botId);
  },

  async delete(botId) { await ctx.db().from('bots').delete().eq('id', botId); return true; },

  async listByOwner(ownerId) {
    return ctx.rows(await ctx.db().from('bots').select().eq('ownerid', ownerId)).map(b => ({ ...mapBot(b), apiKeyHash: undefined }));
  },

  async regenerateApiKey(botId) {
    const apiKey = generateApiKey();
    await this.update(botId, { apiKeyHash: hashApiKey(apiKey) });
    return apiKey;
  },

  hasPermission(bot, permission) { return bot.permissions.includes(permission) || bot.permissions.includes('admin'); },
  canAccessRoom(bot, roomId) { return bot.allowedRooms.length === 0 || bot.allowedRooms.includes(roomId); },
  async touch(botId) { return this.update(botId, { lastUsedAt: Date.now() }); },
});
