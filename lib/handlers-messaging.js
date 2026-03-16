/**
 * Create text/file/image messaging WebSocket message handlers.
 * @param {import('./zellous-core.js').ZellousCore} core
 * @returns {Object.<string, function(Object, Object): Promise<void>>}
 */
export const createMessagingHandlers = (core) => ({
  text_message: async (client, msg) => {
    let msgData = { userId: client.id, username: client.username, type: 'text', content: msg.content, timestamp: Date.now() };
    if (core.storage) msgData = await core.storage.messages.save(client.roomId, msgData);
    core.broadcast({ type: 'text_message', ...msgData, isAuthenticated: client.isAuthenticated }, null, client.roomId);
    core.emit('textMessage', { ...msgData, roomId: client.roomId });
  },

  image_message: async (client, msg) => {
    let msgData = { userId: client.id, username: client.username, type: 'image', content: msg.caption || '', timestamp: Date.now() };
    if (core.storage) {
      const fileMeta = await core.storage.files.save(client.roomId, client.id, msg.filename || 'image.png', Buffer.from(msg.data, 'base64'), 'images');
      msgData.metadata = { fileId: fileMeta.id, filename: fileMeta.originalName, size: fileMeta.size, mimeType: fileMeta.mimeType };
      msgData = await core.storage.messages.save(client.roomId, msgData);
    }
    core.broadcast({ type: 'image_message', ...msgData, isAuthenticated: client.isAuthenticated }, null, client.roomId);
  },

  file_upload_complete: async (client, msg) => {
    let msgData = { userId: client.id, username: client.username, type: 'file', content: msg.description || '', timestamp: Date.now() };
    if (core.storage) {
      const fileMeta = await core.storage.files.save(client.roomId, client.id, msg.filename, Buffer.from(msg.data, 'base64'), msg.path || '');
      msgData.metadata = { fileId: fileMeta.id, filename: fileMeta.originalName, size: fileMeta.size, mimeType: fileMeta.mimeType, path: fileMeta.path };
      msgData = await core.storage.messages.save(client.roomId, msgData);
    }
    core.broadcast({ type: 'file_shared', ...msgData, isAuthenticated: client.isAuthenticated }, null, client.roomId);
    core.emit('fileShared', { ...msgData, roomId: client.roomId });
  },

  get_messages: async (client, msg) => {
    if (!core.storage) return;
    const msgs = await core.storage.messages.getRecent(client.roomId, msg.limit || 50, msg.before);
    client.ws.send(core.pack({ type: 'message_history', messages: msgs }));
  },

  get_files: async (client, msg) => {
    if (!core.storage) return;
    const fileList = await core.storage.files.list(client.roomId, msg.path || '');
    client.ws.send(core.pack({ type: 'file_list', files: fileList, path: msg.path || '' }));
  },

  set_username: async (client, msg) => {
    client.username = msg.username;
    core.broadcast({ type: 'user_updated', userId: client.id, username: msg.username }, null, client.roomId);
  },
});
