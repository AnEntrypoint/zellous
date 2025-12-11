import { users, sessions } from './storage.js';
import { validators } from './validation.js';
import { errorResponse } from './response-formatter.js';
import { nowISO, createTimestamps, updateTimestamp } from '@sequentialos/timestamp-utilities';

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

const login = async (username, password, deviceInfo = null) => {
  const user = await users.authenticate(username, password);
  if (!user) {
    return errorResponse('Invalid username or password');
  }

  let device = null;
  if (deviceInfo) {
    device = await users.addDevice(user.id, deviceInfo);
  }

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

const logout = async (sessionId) => {
  return sessions.delete(sessionId);
};

const logoutAll = async (userId) => {
  const userSessions = await sessions.findByUserId(userId);
  for (const session of userSessions) {
    await sessions.delete(session.id);
  }
  return userSessions.length;
};

const getActiveSessions = async (userId) => {
  const userSessions = await sessions.findByUserId(userId);
  return userSessions.map(s => ({
    id: s.id,
    deviceId: s.deviceId,
    createdAt: s.createdAt,
    lastActivityAt: s.lastActivityAt
  }));
};

const getDevices = async (userId) => {
  return users.getDevices(userId);
};

const removeDevice = async (userId, deviceId) => {
  const userSessions = await sessions.findByUserId(userId);
  for (const session of userSessions) {
    if (session.deviceId === deviceId) {
      await sessions.delete(session.id);
    }
  }
  return users.removeDevice(userId, deviceId);
};

export { register, login, logout, logoutAll, getActiveSessions, getDevices, removeDevice };
