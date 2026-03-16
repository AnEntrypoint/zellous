import { createMediaHandlers } from './handlers-media.js';
import { createMessagingHandlers } from './handlers-messaging.js';

/**
 * Create the default set of WebSocket message handlers.
 * Includes: authenticate, join_room, audio/video media, messaging, files.
 * @param {import('./zellous-core.js').ZellousCore} core
 * @returns {Object.<string, function(Object, Object): Promise<void>>}
 */
export function createDefaultHandlers(core) {
  return {
    authenticate: async (client, msg) => {
      if (!core.auth) { client.ws.send(core.pack({ type: 'auth_failed', error: 'Authentication not enabled' })); return; }
      const auth = await core.auth.authenticateWebSocket(msg.token);
      if (auth) {
        client.userId = auth.user.id; client.username = auth.user.displayName;
        client.sessionId = auth.session.id; client.isAuthenticated = true;
        client.ws.send(core.pack({ type: 'auth_success', user: auth.user }));
        core.emit('userAuthenticated', { clientId: client.id, user: auth.user });
      } else {
        client.ws.send(core.pack({ type: 'auth_failed', error: 'Invalid or expired token' }));
      }
    },

    join_room: async (client, msg) => {
      const roomId = msg.roomId || 'lobby';
      await core.joinRoom(client, roomId);
      const roomClients = Array.from(core.state.clients.values()).filter(c => c.roomId === roomId && c !== client);
      client.ws.send(core.pack({ type: 'room_joined', roomId, currentUsers: roomClients.map(c => ({ id: c.id, username: c.username, isBot: c.isBot, isAuthenticated: c.isAuthenticated })) }));
      core.broadcast({ type: 'user_joined', user: client.username, userId: client.id, isBot: client.isBot, isAuthenticated: client.isAuthenticated }, client, roomId);
      if (core.storage) {
        const recentMsgs = await core.storage.messages.getRecent(roomId, 50);
        if (recentMsgs.length > 0) client.ws.send(core.pack({ type: 'message_history', messages: recentMsgs }));
      }
    },

    ...createMediaHandlers(core),
    ...createMessagingHandlers(core),
  };
}
