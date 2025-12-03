import { users, sessions } from './storage.js';
import { validators } from './validation.js';
import { errorResponse } from './response-formatter.js';

// Authentication middleware and helpers

// Parse session token from various sources
const parseToken = (req) => {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check query parameter
  if (req.query?.token) {
    return req.query.token;
  }

  // Check cookie
  if (req.cookies?.session) {
    return req.cookies.session;
  }

  return null;
};

// Express middleware for optional auth
const optionalAuth = async (req, res, next) => {
  const token = parseToken(req);
  if (token) {
    const session = await sessions.validate(token);
    if (session) {
      const user = await users.findById(session.userId);
      if (user) {
        req.session = session;
        req.user = {
          id: user.id,
          username: user.username,
          displayName: user.displayName
        };
      }
    }
  }
  next();
};

// Express middleware for required auth
const requireAuth = async (req, res, next) => {
  const token = parseToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = await sessions.validate(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const user = await users.findById(session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  req.session = session;
  req.user = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    settings: user.settings
  };
  next();
};

// WebSocket authentication helper
const authenticateWebSocket = async (token) => {
  if (!token) return null;

  const session = await sessions.validate(token);
  if (!session) return null;

  const user = await users.findById(session.userId);
  if (!user) return null;

  await sessions.touch(session.id);

  return {
    session,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName
    }
  };
};

// Register new user
const register = async (username, password, displayName = null) => {
  let validation = validators.username(username);
  if (!validation.valid) return errorResponse(validation.error);

  const existing = await users.findByUsername(username);
  if (existing) {
    return errorResponse('Username already taken');
  }

  validation = validators.password(password);
  if (!validation.valid) return errorResponse(validation.error);

  const user = await users.create(username, password, displayName);
  return { user };
};

// Login user
const login = async (username, password, deviceInfo = null) => {
  const user = await users.authenticate(username, password);
  if (!user) {
    return errorResponse('Invalid username or password');
  }

  // Add device if info provided
  let device = null;
  if (deviceInfo) {
    device = await users.addDevice(user.id, deviceInfo);
  }

  // Create session
  const session = await sessions.create(user.id, device?.id);

  return {
    user,
    session: {
      id: session.id,
      expiresAt: session.expiresAt
    },
    device
  };
};

// Logout user
const logout = async (sessionId) => {
  return sessions.delete(sessionId);
};

// Logout all sessions for user
const logoutAll = async (userId) => {
  const userSessions = await sessions.findByUserId(userId);
  for (const session of userSessions) {
    await sessions.delete(session.id);
  }
  return userSessions.length;
};

// Get user's active sessions
const getActiveSessions = async (userId) => {
  const userSessions = await sessions.findByUserId(userId);
  return userSessions.map(s => ({
    id: s.id,
    deviceId: s.deviceId,
    createdAt: s.createdAt,
    lastActivityAt: s.lastActivityAt
  }));
};

// Get user's devices
const getDevices = async (userId) => {
  return users.getDevices(userId);
};

// Remove device
const removeDevice = async (userId, deviceId) => {
  // Also remove any sessions using this device
  const userSessions = await sessions.findByUserId(userId);
  for (const session of userSessions) {
    if (session.deviceId === deviceId) {
      await sessions.delete(session.id);
    }
  }
  return users.removeDevice(userId, deviceId);
};

// Update user settings
const updateSettings = async (userId, settings) => {
  const user = await users.findById(userId);
  if (!user) return null;
  const newSettings = { ...user.settings, ...settings };
  await users.update(userId, { settings: newSettings });
  return newSettings;
};

// Update display name
const updateDisplayName = async (userId, displayName) => {
  const validation = validators.displayName(displayName);
  if (!validation.valid) return errorResponse(validation.error);
  await users.update(userId, { displayName });
  return { displayName };
};

// Change password
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await users.findById(userId);
  if (!user) return errorResponse('User not found');

  const crypto = await import('crypto');
  const testHash = crypto.pbkdf2Sync(currentPassword, user.passwordSalt, 10000, 64, 'sha512').toString('hex');
  if (testHash !== user.passwordHash) {
    return errorResponse('Current password is incorrect');
  }

  const validation = validators.password(newPassword);
  if (!validation.valid) return errorResponse(validation.error);

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(newPassword, salt, 10000, 64, 'sha512').toString('hex');

  await users.update(userId, {
    passwordSalt: salt,
    passwordHash: hash
  });

  const userSessions = await sessions.findByUserId(userId);
  for (const session of userSessions) {
    await sessions.delete(session.id);
  }

  return { success: true };
};

export {
  parseToken,
  optionalAuth,
  requireAuth,
  authenticateWebSocket,
  register,
  login,
  logout,
  logoutAll,
  getActiveSessions,
  getDevices,
  removeDevice,
  updateSettings,
  updateDisplayName,
  changePassword
};
