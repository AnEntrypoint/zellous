import { users, sessions } from './storage.js';

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
  // Validate username
  if (!username || username.length < 3 || username.length > 32) {
    return { error: 'Username must be 3-32 characters' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { error: 'Username can only contain letters, numbers, and underscores' };
  }

  // Check if username exists
  const existing = await users.findByUsername(username);
  if (existing) {
    return { error: 'Username already taken' };
  }

  // Validate password
  if (!password || password.length < 6) {
    return { error: 'Password must be at least 6 characters' };
  }

  // Create user
  const user = await users.create(username, password, displayName);
  return { user };
};

// Login user
const login = async (username, password, deviceInfo = null) => {
  const user = await users.authenticate(username, password);
  if (!user) {
    return { error: 'Invalid username or password' };
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
  if (!displayName || displayName.length < 1 || displayName.length > 64) {
    return { error: 'Display name must be 1-64 characters' };
  }
  await users.update(userId, { displayName });
  return { displayName };
};

// Change password
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await users.findById(userId);
  if (!user) return { error: 'User not found' };

  // Import the verification function
  const crypto = await import('crypto');
  const testHash = crypto.pbkdf2Sync(currentPassword, user.passwordSalt, 10000, 64, 'sha512').toString('hex');
  if (testHash !== user.passwordHash) {
    return { error: 'Current password is incorrect' };
  }

  if (!newPassword || newPassword.length < 6) {
    return { error: 'New password must be at least 6 characters' };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(newPassword, salt, 10000, 64, 'sha512').toString('hex');

  await users.update(userId, {
    passwordSalt: salt,
    passwordHash: hash
  });

  // Invalidate all other sessions
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
