export function createDefaultHandlers(core) {
  return {
    authenticate: async (client, msg) => {
      if (!core.auth) {
        client.ws.send(core.pack({ type: 'auth_failed', error: 'Authentication not enabled' }));
        return;
      }

      const auth = await core.auth.authenticateWebSocket(msg.token);
      if (auth) {
        client.userId = auth.user.id;
        client.username = auth.user.displayName;
        client.sessionId = auth.session.id;
        client.isAuthenticated = true;
        
        client.ws.send(core.pack({
          type: 'auth_success',
          user: auth.user
        }));
        
        core.emit('userAuthenticated', { clientId: client.id, user: auth.user });
      } else {
        client.ws.send(core.pack({
          type: 'auth_failed',
          error: 'Invalid or expired token'
        }));
      }
    },

    join_room: async (client, msg) => {
      const roomId = msg.roomId || 'lobby';
      await core.joinRoom(client, roomId);

      const roomClients = Array.from(core.state.clients.values())
        .filter(c => c.roomId === roomId && c !== client);

      client.ws.send(core.pack({
        type: 'room_joined',
        roomId,
        currentUsers: roomClients.map(c => ({
          id: c.id,
          username: c.username,
          isBot: c.isBot,
          isAuthenticated: c.isAuthenticated
        }))
      }));

      core.broadcast({
        type: 'user_joined',
        user: client.username,
        userId: client.id,
        isBot: client.isBot,
        isAuthenticated: client.isAuthenticated
      }, client, roomId);

      if (core.storage) {
        const recentMsgs = await core.storage.messages.getRecent(roomId, 50);
        if (recentMsgs.length > 0) {
          client.ws.send(core.pack({
            type: 'message_history',
            messages: recentMsgs
          }));
        }
      }
    },

    audio_start: async (client) => {
      client.speaking = true;
      
      if (core.storage) {
        const mediaSessionId = await core.storage.media.createSession(
          client.roomId, 
          client.id, 
          client.username
        );
        core.state.mediaSessions.set(client.id, mediaSessionId);
      }

      core.broadcast({
        type: 'speaker_joined',
        user: client.username,
        userId: client.id
      }, null, client.roomId);
      
      core.emit('audioStarted', { clientId: client.id, roomId: client.roomId });
    },

    audio_chunk: async (client, msg) => {
      const mediaSessionId = core.state.mediaSessions.get(client.id);
      if (mediaSessionId && core.storage) {
        await core.storage.media.saveChunk(
          client.roomId, 
          client.id, 
          'audio', 
          msg.data, 
          mediaSessionId
        );
      }
      
      core.broadcast({
        type: 'audio_data',
        userId: client.id,
        data: msg.data
      }, client, client.roomId);
    },

    audio_end: async (client) => {
      client.speaking = false;
      const mediaSessionId = core.state.mediaSessions.get(client.id);
      
      if (mediaSessionId && core.storage) {
        await core.storage.media.endSession(client.roomId, mediaSessionId);
        core.state.mediaSessions.delete(client.id);
      }
      
      core.broadcast({
        type: 'speaker_left',
        userId: client.id,
        user: client.username
      }, null, client.roomId);
      
      core.emit('audioEnded', { clientId: client.id, roomId: client.roomId });
    },

    video_chunk: async (client, msg) => {
      const mediaSessionId = core.state.mediaSessions.get(client.id);
      if (mediaSessionId && core.storage) {
        await core.storage.media.saveChunk(
          client.roomId, 
          client.id, 
          'video', 
          msg.data, 
          mediaSessionId
        );
      }
      
      core.broadcast({
        type: 'video_chunk',
        userId: client.id,
        data: msg.data
      }, client, client.roomId);
    },

    text_message: async (client, msg) => {
      let msgData = {
        userId: client.id,
        username: client.username,
        type: 'text',
        content: msg.content,
        timestamp: Date.now()
      };

      if (core.storage) {
        msgData = await core.storage.messages.save(client.roomId, msgData);
      }

      core.broadcast({
        type: 'text_message',
        ...msgData,
        isAuthenticated: client.isAuthenticated
      }, null, client.roomId);
      
      core.emit('textMessage', { ...msgData, roomId: client.roomId });
    },

    image_message: async (client, msg) => {
      let msgData = {
        userId: client.id,
        username: client.username,
        type: 'image',
        content: msg.caption || '',
        timestamp: Date.now()
      };

      if (core.storage) {
        const imageBuffer = Buffer.from(msg.data, 'base64');
        const fileMeta = await core.storage.files.save(
          client.roomId,
          client.id,
          msg.filename || 'image.png',
          imageBuffer,
          'images'
        );

        msgData.metadata = {
          fileId: fileMeta.id,
          filename: fileMeta.originalName,
          size: fileMeta.size,
          mimeType: fileMeta.mimeType
        };

        msgData = await core.storage.messages.save(client.roomId, msgData);
      }

      core.broadcast({
        type: 'image_message',
        ...msgData,
        isAuthenticated: client.isAuthenticated
      }, null, client.roomId);
    },

    file_upload_complete: async (client, msg) => {
      let msgData = {
        userId: client.id,
        username: client.username,
        type: 'file',
        content: msg.description || '',
        timestamp: Date.now()
      };

      if (core.storage) {
        const fileBuffer = Buffer.from(msg.data, 'base64');
        const fileMeta = await core.storage.files.save(
          client.roomId,
          client.id,
          msg.filename,
          fileBuffer,
          msg.path || ''
        );

        msgData.metadata = {
          fileId: fileMeta.id,
          filename: fileMeta.originalName,
          size: fileMeta.size,
          mimeType: fileMeta.mimeType,
          path: fileMeta.path
        };

        msgData = await core.storage.messages.save(client.roomId, msgData);
      }

      core.broadcast({
        type: 'file_shared',
        ...msgData,
        isAuthenticated: client.isAuthenticated
      }, null, client.roomId);
      
      core.emit('fileShared', { ...msgData, roomId: client.roomId });
    },

    set_username: async (client, msg) => {
      client.username = msg.username;
      core.broadcast({
        type: 'user_updated',
        userId: client.id,
        username: msg.username
      }, null, client.roomId);
    },

    get_messages: async (client, msg) => {
      if (!core.storage) return;
      
      const msgs = await core.storage.messages.getRecent(
        client.roomId, 
        msg.limit || 50, 
        msg.before
      );
      
      client.ws.send(core.pack({
        type: 'message_history',
        messages: msgs
      }));
    },

    get_files: async (client, msg) => {
      if (!core.storage) return;

      const fileList = await core.storage.files.list(client.roomId, msg.path || '');
      client.ws.send(core.pack({
        type: 'file_list',
        files: fileList,
        path: msg.path || ''
      }));
    }
  };
}
