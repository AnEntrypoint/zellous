import { users, sessions } from './db.js';
import { validators, errorResponse } from './utils.js';

const register = async (username, password, displayName = null) => {
  let v = validators.username(username);
  if (!v.valid) return errorResponse(v.error);
  if (await users.findByUsername(username)) return errorResponse('Username already taken');
  v = validators.password(password);
  if (!v.valid) return errorResponse(v.error);
  const user = await users.create(username, password, displayName);
  return { user };
};

const login = async (username, password, deviceInfo = null) => {
  const user = await users.authenticate(username, password);
  if (!user) return errorResponse('Invalid username or password');
  let device = null;
  if (deviceInfo) device = await users.addDevice(user.id, deviceInfo);
  const session = await sessions.create(user.id, device?.id);
  return { user, session: { id: session.id, expiresAt: session.expiresAt }, device };
};

const logout = async (sessionId) => sessions.delete(sessionId);

const logoutAll = async (userId) => {
  const userSessions = await sessions.findByUserId(userId);
  for (const s of userSessions) await sessions.delete(s.id);
  return userSessions.length;
};

const getActiveSessions = async (userId) =>
  (await sessions.findByUserId(userId)).map(s => ({ id: s.id, deviceId: s.deviceId, createdAt: s.createdAt, lastActivityAt: s.lastActivityAt }));

const getDevices = async (userId) => users.getDevices(userId);

const removeDevice = async (userId, deviceId) => {
  for (const s of await sessions.findByUserId(userId)) if (s.deviceId === deviceId) await sessions.delete(s.id);
  return users.removeDevice(userId, deviceId);
};

const updateSettings = async (userId, settings) => {
  const user = await users.findById(userId);
  if (!user) return null;
  const newSettings = { ...user.settings, ...settings };
  await users.update(userId, { settings: newSettings });
  return newSettings;
};

const updateDisplayName = async (userId, displayName) => {
  const v = validators.displayName(displayName);
  if (!v.valid) return errorResponse(v.error);
  await users.update(userId, { displayName });
  return { displayName };
};

const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await users.findById(userId);
  if (!user) return errorResponse('User not found');
  const { verifyPassword, hashPassword } = await import('./db.js');
  if (!verifyPassword(currentPassword, user.passwordSalt, user.passwordHash)) return errorResponse('Current password is incorrect');
  const v = validators.password(newPassword);
  if (!v.valid) return errorResponse(v.error);
  const { salt, hash } = hashPassword(newPassword);
  await users.update(userId, { passwordSalt: salt, passwordHash: hash });
  for (const s of await sessions.findByUserId(userId)) await sessions.delete(s.id);
  return { success: true };
};

const parseToken = (req) => {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7);
  if (req.query?.token) return req.query.token;
  return null;
};

const optionalAuth = async (req, res, next) => {
  const token = parseToken(req);
  if (token) {
    const session = await sessions.validate(token);
    if (session) {
      const user = await users.findById(session.userId);
      if (user) { req.session = session; req.user = { id: user.id, username: user.username, displayName: user.displayName }; }
    }
  }
  next();
};

const requireAuth = async (req, res, next) => {
  const token = parseToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const session = await sessions.validate(token);
  if (!session) return res.status(401).json({ error: 'Invalid or expired session' });
  const user = await users.findById(session.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  req.session = session;
  req.user = { id: user.id, username: user.username, displayName: user.displayName, settings: user.settings };
  next();
};

const authenticateWebSocket = async (token) => {
  if (!token) return null;
  const session = await sessions.validate(token);
  if (!session) return null;
  const user = await users.findById(session.userId);
  if (!user) return null;
  await sessions.touch(session.id);
  return { session, user: { id: user.id, username: user.username, displayName: user.displayName } };
};

export { register, login, logout, logoutAll, getActiveSessions, getDevices, removeDevice, updateSettings, updateDisplayName, changePassword, parseToken, optionalAuth, requireAuth, authenticateWebSocket };
