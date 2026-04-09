import { Router } from 'express';
import { register, login, logout, logoutAll, getActiveSessions, getDevices, removeDevice, updateSettings, updateDisplayName, changePassword, requireAuth } from './auth-ops.js';

const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const { username, password, displayName } = req.body;
  const result = await register(username, password, displayName);
  res.status(result.error ? 400 : 200).json(result);
});

authRouter.post('/login', async (req, res) => {
  const { username, password, deviceName, userAgent } = req.body;
  const result = await login(username, password, { name: deviceName, userAgent });
  res.status(result.error ? 401 : 200).json(result);
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  await logout(req.session.id);
  res.json({ success: true });
});

authRouter.post('/logout-all', requireAuth, async (req, res) => {
  const count = await logoutAll(req.user.id);
  res.json({ success: true, sessionsInvalidated: count });
});

const userRouter = Router();

userRouter.get('/user', requireAuth, (req, res) => res.json({ user: req.user }));

userRouter.patch('/user', requireAuth, async (req, res) => {
  const { displayName, settings } = req.body;
  const updates = {};
  if (displayName) {
    const result = await updateDisplayName(req.user.id, displayName);
    if (result.error) return res.status(400).json(result);
    updates.displayName = result.displayName;
  }
  if (settings) updates.settings = await updateSettings(req.user.id, settings);
  res.json(updates);
});

userRouter.post('/user/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const result = await changePassword(req.user.id, currentPassword, newPassword);
  res.status(result.error ? 400 : 200).json(result);
});

userRouter.get('/sessions', requireAuth, async (req, res) => {
  res.json({ sessions: await getActiveSessions(req.user.id) });
});

userRouter.get('/devices', requireAuth, async (req, res) => {
  res.json({ devices: await getDevices(req.user.id) });
});

userRouter.delete('/devices/:deviceId', requireAuth, async (req, res) => {
  await removeDevice(req.user.id, req.params.deviceId);
  res.json({ success: true });
});

export { authRouter, userRouter };
