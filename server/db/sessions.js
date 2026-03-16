import { generateId } from './utils.js';

const mapSession = (s) => s ? { id: s.id, userId: s.userid, deviceId: s.deviceid, createdAt: s.createdat, lastActivityAt: s.lastactivityat, expiresAt: s.expiresat } : null;

export const makeSessions = (ctx) => ({
  async create(userId, deviceId = null) {
    const sessionId = generateId();
    await ctx.db().from('sessions').insert({
      id: sessionId, userid: userId, deviceid: deviceId || 'none',
      createdat: Date.now(), lastactivityat: Date.now(),
      expiresat: Date.now() + (ctx.config().sessionTtl || 7 * 24 * 60 * 60 * 1000),
    });
    return this.findById(sessionId);
  },

  async findById(sessionId) {
    return mapSession(ctx.row(await ctx.db().from('sessions').select().eq('id', sessionId).maybeSingle()));
  },

  async update(sessionId, updates) {
    const patch = {};
    if (updates.lastActivityAt !== undefined) patch.lastactivityat = updates.lastActivityAt;
    if (updates.expiresAt !== undefined) patch.expiresat = updates.expiresAt;
    if (Object.keys(patch).length) await ctx.db().from('sessions').update(patch).eq('id', sessionId);
    return this.findById(sessionId);
  },

  async touch(sessionId) { return this.update(sessionId, { lastActivityAt: Date.now() }); },

  async delete(sessionId) { await ctx.db().from('sessions').delete().eq('id', sessionId); return true; },

  async findByUserId(userId) {
    return ctx.rows(await ctx.db().from('sessions').select().eq('userid', userId)).map(mapSession);
  },

  async validate(sessionId) {
    const session = await this.findById(sessionId);
    if (!session) return null;
    if (session.expiresAt < Date.now()) { await this.delete(sessionId); return null; }
    return session;
  },

  async deleteExpired() {
    const now = Date.now();
    const expired = ctx.rows(await ctx.db().from('sessions').select().lte('expiresat', now));
    for (const s of expired) { try { await ctx.db().from('sessions').delete().eq('id', s.id); } catch {} }
  },
});
