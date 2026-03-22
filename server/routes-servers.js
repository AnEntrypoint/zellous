import { Router } from 'express';
import { servers, rooms } from './db.js';
import { optionalAuth } from './auth-ops.js';

const makeRouter = (broadcast) => {
  const router = Router();

  router.post('/', optionalAuth, async (req, res) => {
    const { name, iconColor, type, url } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    if (type && !['community', 'page'].includes(type)) return res.status(400).json({ error: 'type must be community or page' });
    const userId = req.user?.id || 'anon';
    const username = req.user?.displayName || req.user?.username || 'Anonymous';
    const srv = await servers.create({ name: name.trim(), ownerId: userId, ownerName: username, iconColor, type: type || 'community', url: url || null });
    await rooms.ensureRoom(srv.id);
    res.json({ server: srv });
  });

  router.get('/', optionalAuth, async (req, res) => {
    const userId = req.user?.id;
    const list = userId ? await servers.listForUser(userId) : await servers.listAll();
    res.json({ servers: list });
  });

  router.get('/:serverId', async (req, res) => {
    const meta = await servers.getMeta(req.params.serverId);
    if (!meta) return res.status(404).json({ error: 'Server not found' });
    res.json({ server: meta });
  });

  router.patch('/:serverId', optionalAuth, async (req, res) => {
    const meta = await servers.getMeta(req.params.serverId);
    if (!meta) return res.status(404).json({ error: 'Server not found' });
    const role = meta.members?.find(m => m.userId === req.user?.id)?.role;
    if (!role || !['owner', 'admin'].includes(role)) return res.status(403).json({ error: 'Insufficient permissions' });
    const updates = {};
    if (req.body.name) updates.name = req.body.name.trim();
    if (req.body.iconColor) updates.iconColor = req.body.iconColor;
    if (req.body.type !== undefined) updates.type = req.body.type;
    if (req.body.url !== undefined) updates.url = req.body.url;
    res.json({ server: await servers.updateMeta(req.params.serverId, updates) });
  });

  router.delete('/:serverId', optionalAuth, async (req, res) => {
    const meta = await servers.getMeta(req.params.serverId);
    if (!meta) return res.status(404).json({ error: 'Server not found' });
    if (meta.ownerId !== req.user?.id) return res.status(403).json({ error: 'Only owner can delete' });
    await servers.remove(req.params.serverId);
    res.json({ success: true });
  });

  router.post('/:serverId/join', optionalAuth, async (req, res) => {
    const userId = req.user?.id || 'anon-' + Date.now();
    const username = req.user?.displayName || req.user?.username || 'Guest';
    const result = await servers.join(req.params.serverId, userId, username);
    if (!result) return res.status(404).json({ error: 'Server not found or banned' });
    res.json({ server: result });
  });

  router.post('/:serverId/leave', optionalAuth, async (req, res) => {
    if (!req.user?.id) return res.status(401).json({ error: 'Auth required' });
    const ok = await servers.leave(req.params.serverId, req.user.id);
    if (!ok) return res.status(400).json({ error: 'Cannot leave (owner or not found)' });
    res.json({ success: true });
  });

  router.post('/:serverId/kick/:userId', optionalAuth, async (req, res) => {
    const meta = await servers.getMeta(req.params.serverId);
    if (!meta) return res.status(404).json({ error: 'Server not found' });
    const callerRole = meta.members?.find(m => m.userId === req.user?.id)?.role;
    if (!callerRole || !['owner', 'admin', 'moderator'].includes(callerRole)) return res.status(403).json({ error: 'Insufficient permissions' });
    const target = meta.members?.find(m => m.userId === req.params.userId);
    if (!target) return res.status(404).json({ error: 'User not in server' });
    if (target.role === 'owner') return res.status(403).json({ error: 'Cannot kick owner' });
    await servers.leave(req.params.serverId, req.params.userId);
    broadcast({ type: 'user_kicked', userId: req.params.userId, serverId: req.params.serverId }, null, req.params.serverId);
    res.json({ success: true });
  });

  router.post('/:serverId/ban/:userId', optionalAuth, async (req, res) => {
    const meta = await servers.getMeta(req.params.serverId);
    if (!meta) return res.status(404).json({ error: 'Server not found' });
    const callerRole = meta.members?.find(m => m.userId === req.user?.id)?.role;
    if (!callerRole || !['owner', 'admin'].includes(callerRole)) return res.status(403).json({ error: 'Insufficient permissions' });
    const target = meta.members?.find(m => m.userId === req.params.userId);
    if (target?.role === 'owner') return res.status(403).json({ error: 'Cannot ban owner' });
    if (!meta.bans) meta.bans = [];
    if (!meta.bans.includes(req.params.userId)) meta.bans.push(req.params.userId);
    meta.members = meta.members.filter(m => m.userId !== req.params.userId);
    await servers.updateMeta(req.params.serverId, { members: meta.members, bans: meta.bans });
    broadcast({ type: 'user_banned', userId: req.params.userId, serverId: req.params.serverId }, null, req.params.serverId);
    res.json({ success: true });
  });

  router.patch('/:serverId/roles/:userId', optionalAuth, async (req, res) => {
    const meta = await servers.getMeta(req.params.serverId);
    if (!meta) return res.status(404).json({ error: 'Server not found' });
    const callerRole = meta.members?.find(m => m.userId === req.user?.id)?.role;
    if (!callerRole || !['owner', 'admin'].includes(callerRole)) return res.status(403).json({ error: 'Insufficient permissions' });
    const { role } = req.body;
    if (!['admin', 'moderator', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const ok = await servers.setMemberRole(req.params.serverId, req.params.userId, role);
    if (!ok) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
  });

  return router;
};

export default makeRouter;
