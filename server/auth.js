import { parseToken, optionalAuth, requireAuth, authenticateWebSocket } from './auth-middleware.js';
import { register, login, logout, logoutAll, getActiveSessions, getDevices, removeDevice } from './auth-operations.js';
import { updateSettings, updateDisplayName, changePassword } from './auth-settings.js';

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
