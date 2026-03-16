export const createMediaHandlers = (core) => ({
  audio_start: async (client) => {
    client.speaking = true;
    if (core.storage) {
      const sid = await core.storage.media.createSession(client.roomId, client.id, client.username);
      core.state.mediaSessions.set(client.id, sid);
    }
    core.broadcast({ type: 'speaker_joined', user: client.username, userId: client.id }, null, client.roomId);
    core.emit('audioStarted', { clientId: client.id, roomId: client.roomId });
  },

  audio_chunk: async (client, msg) => {
    const sid = core.state.mediaSessions.get(client.id);
    if (sid && core.storage) await core.storage.media.saveChunk(client.roomId, client.id, 'audio', msg.data, sid);
    core.broadcast({ type: 'audio_data', userId: client.id, data: msg.data }, client, client.roomId);
  },

  audio_end: async (client) => {
    client.speaking = false;
    const sid = core.state.mediaSessions.get(client.id);
    if (sid && core.storage) { await core.storage.media.endSession(client.roomId, sid); core.state.mediaSessions.delete(client.id); }
    core.broadcast({ type: 'speaker_left', userId: client.id, user: client.username }, null, client.roomId);
    core.emit('audioEnded', { clientId: client.id, roomId: client.roomId });
  },

  video_chunk: async (client, msg) => {
    const sid = core.state.mediaSessions.get(client.id);
    if (sid && core.storage) await core.storage.media.saveChunk(client.roomId, client.id, 'video', msg.data, sid);
    core.broadcast({ type: 'video_chunk', userId: client.id, data: msg.data }, client, client.roomId);
  },
});
