import { Router } from 'express';
import { rooms, messages, files } from './db.js';
import { optionalAuth } from './auth-ops.js';
import { promises as fsp } from 'fs';

const makeRouter = (state, broadcast) => {
  const router = Router();

  router.get('/', (req, res) => {
    const roomList = [];
    for (const [roomId, roomUsers] of state.roomUsers.entries()) roomList.push({ id: roomId, userCount: roomUsers.size });
    res.json({ rooms: roomList });
  });

  router.get('/:roomId', async (req, res) => {
    const { roomId } = req.params;
    const roomClients = Array.from(state.clients.values()).filter(c => c.roomId === roomId)
      .map(c => ({ id: c.id, username: c.username, speaking: c.speaking, isBot: c.isBot, isAuthenticated: c.isAuthenticated }));
    res.json({ roomId, users: roomClients, userCount: roomClients.length, meta: await rooms.getMeta(roomId) });
  });

  router.get('/:roomId/messages', async (req, res) => {
    const msgs = await messages.getRecent(req.params.roomId, parseInt(req.query.limit) || 50, req.query.before ? parseInt(req.query.before) : null, req.query.channelId || null);
    res.json({ messages: msgs });
  });

  router.delete('/:roomId/messages/:messageId', optionalAuth, async (req, res) => {
    const deleted = await messages.remove(req.params.roomId, req.params.messageId);
    if (!deleted) return res.status(404).json({ error: 'Message not found' });
    broadcast({ type: 'message_deleted', messageId: req.params.messageId }, null, req.params.roomId);
    res.json({ success: true });
  });

  router.patch('/:roomId/messages/:messageId', optionalAuth, async (req, res) => {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
    const existing = await messages.getById(req.params.roomId, req.params.messageId);
    if (!existing) return res.status(404).json({ error: 'Message not found' });
    const updated = await messages.update(req.params.roomId, req.params.messageId, { content: content.trim() });
    if (!updated) return res.status(500).json({ error: 'Update failed' });
    broadcast({ type: 'message_updated', messageId: req.params.messageId, content: updated.content, edited: true, editedAt: updated.editedAt }, null, req.params.roomId);
    res.json({ success: true, message: updated });
  });

  router.get('/:roomId/files', async (req, res) => {
    res.json({ files: await files.list(req.params.roomId, req.query.path || '') });
  });

  router.get('/:roomId/files/:fileId', async (req, res) => {
    const file = await files.get(req.params.roomId, req.params.fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const data = await fsp.readFile(file.filepath);
    res.set('Content-Type', file.meta?.mimeType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${file.meta?.originalName || 'download'}"`);
    res.send(data);
  });

  router.get('/:roomId/channels', async (req, res) => {
    res.json({ channels: await rooms.getChannels(req.params.roomId) });
  });

  router.post('/:roomId/channels', async (req, res) => {
    const { name, type, categoryId, position, url, path: chPath } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    if (!['text', 'voice', 'threaded', 'page', 'game', 'forum'].includes(type)) return res.status(400).json({ error: 'type must be text, voice, threaded, page, game, or forum' });
    await rooms.ensureRoom(req.params.roomId);
    const channel = await rooms.addChannel(req.params.roomId, { name: name.trim(), type, categoryId, position, url: url || null, path: chPath || null });
    if (!channel) return res.status(500).json({ error: 'Failed to create channel' });
    broadcast({ type: 'channel_created', channel }, null, req.params.roomId);
    res.json({ channel });
  });

  router.patch('/:roomId/channels/:channelId', async (req, res) => {
    const { name, categoryId, position, url, path: chPath } = req.body;
    const updates = {};
    if (name?.trim()) updates.name = name.trim();
    if (categoryId !== undefined) updates.categoryId = categoryId;
    if (position !== undefined) updates.position = position;
    if (url !== undefined) updates.url = url;
    if (chPath !== undefined) updates.path = chPath;
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'name, categoryId, position, url, or path required' });
    const channel = await rooms.updateChannel(req.params.roomId, req.params.channelId, updates);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    broadcast({ type: 'channel_updated', channel }, null, req.params.roomId);
    res.json({ channel });
  });

  router.delete('/:roomId/channels/:channelId', async (req, res) => {
    const ok = await rooms.deleteChannel(req.params.roomId, req.params.channelId);
    if (!ok) return res.status(404).json({ error: 'Channel not found' });
    broadcast({ type: 'channel_deleted', channelId: req.params.channelId }, null, req.params.roomId);
    res.json({ success: true });
  });

  router.post('/:roomId/channels/reorder', async (req, res) => {
    const { categoryId, orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds array required' });
    const channels = await rooms.reorderChannels(req.params.roomId, categoryId, orderedIds);
    if (!channels) return res.status(404).json({ error: 'Room not found' });
    broadcast({ type: 'channels_reordered', categoryId, channels }, null, req.params.roomId);
    res.json({ channels });
  });

  router.get('/:roomId/categories', async (req, res) => {
    res.json({ categories: await rooms.getCategories(req.params.roomId) });
  });

  router.post('/:roomId/categories', async (req, res) => {
    const { name, position } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    await rooms.ensureRoom(req.params.roomId);
    const category = await rooms.addCategory(req.params.roomId, { name: name.trim(), position });
    if (!category) return res.status(500).json({ error: 'Failed to create category' });
    broadcast({ type: 'category_created', category }, null, req.params.roomId);
    res.json({ category });
  });

  router.patch('/:roomId/categories/:categoryId', async (req, res) => {
    const { name, position, collapsed } = req.body;
    const updates = {};
    if (name?.trim()) updates.name = name.trim();
    if (position !== undefined) updates.position = position;
    if (collapsed !== undefined) updates.collapsed = collapsed;
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'name, position, or collapsed required' });
    const category = await rooms.updateCategory(req.params.roomId, req.params.categoryId, updates);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    broadcast({ type: 'category_updated', category }, null, req.params.roomId);
    res.json({ category });
  });

  router.delete('/:roomId/categories/:categoryId', async (req, res) => {
    const ok = await rooms.deleteCategory(req.params.roomId, req.params.categoryId);
    if (!ok) return res.status(404).json({ error: 'Category not found' });
    broadcast({ type: 'category_deleted', categoryId: req.params.categoryId }, null, req.params.roomId);
    res.json({ success: true });
  });

  router.post('/:roomId/categories/reorder', async (req, res) => {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds array required' });
    const categories = await rooms.reorderCategories(req.params.roomId, orderedIds);
    if (!categories) return res.status(404).json({ error: 'Room not found' });
    broadcast({ type: 'categories_reordered', categories }, null, req.params.roomId);
    res.json({ categories });
  });

  return router;
};

export default makeRouter;
