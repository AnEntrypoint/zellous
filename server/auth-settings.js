import { users, sessions } from './storage.js';
import { validators } from './validation.js';
import { errorResponse } from './response-formatter.js';

const updateSettings = async (userId, settings) => {
  const user = await users.findById(userId);
  if (!user) return null;
  const newSettings = { ...user.settings, ...settings };
  await users.update(userId, { settings: newSettings });
  return newSettings;
};

const updateDisplayName = async (userId, displayName) => {
  const validation = validators.displayName(displayName);
  if (!validation.valid) return errorResponse(validation.error);
  await users.update(userId, { displayName });
  return { displayName };
};

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

export { updateSettings, updateDisplayName, changePassword };
