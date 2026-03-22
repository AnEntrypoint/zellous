import { promises as fsp } from 'fs';
import { join } from 'path';
import { shortId } from './utils.js';

export const makeServers = (ctx) => ({
  async initialize() {
    await fsp.mkdir(join(ctx.dataRoot(), 'servers'), { recursive: true });
    const ex = ctx.row(await ctx.db().from('serverindex').select().eq('id', '_init').maybeSingle());
    if (!ex) await ctx.db().from('serverindex').insert({ id: '_init', name: '', ownerid: '' });
  },

  async create({ name, ownerId, ownerName, iconColor, type, url }) {
    const id = shortId();
    await fsp.mkdir(join(ctx.dataRoot(), 'servers', id), { recursive: true });
    const meta = { id, name, iconColor: iconColor || '#5865f2', type: type || 'community', url: url || null, ownerId, createdAt: Date.now(), members: [{ userId: ownerId, username: ownerName, role: 'owner', joinedAt: Date.now() }] };
    await fsp.writeFile(join(ctx.dataRoot(), 'servers', id, 'meta.json'), JSON.stringify(meta, null, 2));
    await ctx.db().from('serverindex').insert({ id, name, ownerid: ownerId });
    return meta;
  },

  async getMeta(serverId) {
    try { return JSON.parse(await fsp.readFile(join(ctx.dataRoot(), 'servers', serverId, 'meta.json'), 'utf8')); } catch { return null; }
  },

  async updateMeta(serverId, updates) {
    const meta = await this.getMeta(serverId);
    if (!meta) return null;
    Object.assign(meta, updates);
    await fsp.writeFile(join(ctx.dataRoot(), 'servers', serverId, 'meta.json'), JSON.stringify(meta, null, 2));
    if (updates.name) await ctx.db().from('serverindex').update({ name: updates.name }).eq('id', serverId);
    return meta;
  },

  async remove(serverId) {
    try { await fsp.rm(join(ctx.dataRoot(), 'servers', serverId), { recursive: true, force: true }); await ctx.db().from('serverindex').delete().eq('id', serverId); return true; } catch { return false; }
  },

  async listAll() { return ctx.rows(await ctx.db().from('serverindex').select().neq('id', '_init')).map(r => ({ id: r.id, name: r.name, ownerId: r.ownerid })); },

  async listForUser(userId) {
    const all = await this.listAll();
    const metas = await Promise.all(all.map(s => this.getMeta(s.id)));
    return metas.filter(m => m?.members?.some(mb => mb.userId === userId)).map(m => ({ id: m.id, name: m.name, iconColor: m.iconColor, type: m.type || 'community', url: m.url || null, ownerId: m.ownerId, memberCount: m.members.length }));
  },

  async join(serverId, userId, username) {
    const meta = await this.getMeta(serverId);
    if (!meta || meta.bans?.includes(userId)) return null;
    if (meta.members.some(m => m.userId === userId)) return meta;
    meta.members.push({ userId, username, role: 'member', joinedAt: Date.now() });
    return this.updateMeta(serverId, { members: meta.members });
  },

  async leave(serverId, userId) {
    const meta = await this.getMeta(serverId);
    if (!meta || meta.ownerId === userId) return false;
    meta.members = meta.members.filter(m => m.userId !== userId);
    await this.updateMeta(serverId, { members: meta.members });
    return true;
  },

  async getMemberRole(serverId, userId) { return (await this.getMeta(serverId))?.members?.find(m => m.userId === userId)?.role || null; },

  async setMemberRole(serverId, userId, role) {
    const meta = await this.getMeta(serverId);
    if (!meta) return false;
    const member = meta.members.find(m => m.userId === userId);
    if (!member) return false;
    member.role = role;
    await this.updateMeta(serverId, { members: meta.members });
    return true;
  },
});
