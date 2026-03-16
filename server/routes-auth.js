import { Router } from 'express';
import * as defaultAuthOps from './auth-ops.js';

/**
 * Create an auth router with optional dependency injection.
 * @param {Partial<typeof import('./auth-ops.js')>} [authOps] - Optional auth ops override
 * @returns {import('express').Router}
 */
const makeAuthRouter = (authOps = {}) => {
  const ops = { ...defaultAuthOps, ...authOps };
  const { register, login, logout, logoutAll, getActiveSessions, getDevices, removeDevice, updateSettings, updateDisplayName, changePassword, requireAuth } = ops;
  const router = Router();

  router.post('/register', async (req, res, next) => {
    try {
      const { username, password, displayName } = req.body;
      const result = await register(username, password, displayName);
      res.status(result.error ? 400 : 200).json(result);
    } catch (e) { next(e); }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const { username, password, deviceName, userAgent } = req.body;
      const result = await login(username, password, { name: deviceName, userAgent });
      res.status(result.error ? 401 : 200).json(result);
    } catch (e) { next(e); }
  });

  router.post('/logout', requireAuth, async (req, res, next) => {
    try { await logout(req.session.id); res.json({ success: true }); } catch (e) { next(e); }
  });

  router.post('/logout-all', requireAuth, async (req, res, next) => {
    try {
      const count = await logoutAll(req.user.id);
      res.json({ success: true, sessionsInvalidated: count });
    } catch (e) { next(e); }
  });

  router.get('/user', requireAuth, (req, res) => res.json({ user: req.user }));

  router.patch('/user', requireAuth, async (req, res, next) => {
    try {
      const { displayName, settings } = req.body;
      const updates = {};
      if (displayName) {
        const result = await updateDisplayName(req.user.id, displayName);
        if (result.error) return res.status(400).json(result);
        updates.displayName = result.displayName;
      }
      if (settings) updates.settings = await updateSettings(req.user.id, settings);
      res.json(updates);
    } catch (e) { next(e); }
  });

  router.post('/user/change-password', requireAuth, async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const result = await changePassword(req.user.id, currentPassword, newPassword);
      res.status(result.error ? 400 : 200).json(result);
    } catch (e) { next(e); }
  });

  router.get('/sessions', requireAuth, async (req, res, next) => {
    try { res.json({ sessions: await getActiveSessions(req.user.id) }); } catch (e) { next(e); }
  });

  router.get('/devices', requireAuth, async (req, res, next) => {
    try { res.json({ devices: await getDevices(req.user.id) }); } catch (e) { next(e); }
  });

  router.delete('/devices/:deviceId', requireAuth, async (req, res, next) => {
    try { await removeDevice(req.user.id, req.params.deviceId); res.json({ success: true }); } catch (e) { next(e); }
  });

  return router;
};

export default makeAuthRouter;
