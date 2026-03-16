const joinRoom = async (core, client, roomId) => {
  const oldRoomId = client.roomId;
  if (oldRoomId && core.state.roomUsers.has(oldRoomId)) {
    core.state.roomUsers.get(oldRoomId).delete(client.id);
    if (core.state.roomUsers.get(oldRoomId).size === 0) {
      core.state.roomUsers.delete(oldRoomId);
      await core.storage?.rooms.scheduleCleanup(oldRoomId);
      core.emit('roomEmpty', { roomId: oldRoomId });
    }
  }
  client.roomId = roomId;
  if (!core.state.roomUsers.has(roomId)) {
    core.state.roomUsers.set(roomId, new Set());
    await core.storage?.rooms.cancelCleanup(roomId);
    core.emit('roomCreated', { roomId });
  }
  core.state.roomUsers.get(roomId).add(client.id);
  await core.storage?.rooms.ensureRoom(roomId);
  await core.storage?.rooms.setUserCount(roomId, core.state.roomUsers.get(roomId).size);
  core.emit('userJoinedRoom', { userId: client.id, username: client.username, roomId, userCount: core.state.roomUsers.get(roomId).size });
  return roomId;
};

const leaveRoom = async (core, client) => {
  const roomId = client.roomId;
  if (roomId && core.state.roomUsers.has(roomId)) {
    core.state.roomUsers.get(roomId).delete(client.id);
    const count = core.state.roomUsers.get(roomId).size;
    await core.storage?.rooms.setUserCount(roomId, count);
    core.emit('userLeftRoom', { userId: client.id, roomId, userCount: count });
    if (count === 0) {
      core.state.roomUsers.delete(roomId);
      await core.storage?.rooms.scheduleCleanup(roomId);
      core.emit('roomEmpty', { roomId });
    }
  }
};

const filterClientsByRoom = (core, roomId, exclude = null) =>
  Array.from(core.state.clients.values()).filter(c => c.roomId === roomId && c !== exclude);

const getRoom = (core, roomId) => {
  const users = filterClientsByRoom(core, roomId);
  return { id: roomId, users: users.map(u => ({ id: u.id, username: u.username, speaking: u.speaking, isBot: u.isBot, isAuthenticated: u.isAuthenticated })), userCount: users.length };
};

const getAllRooms = (core) => {
  const rooms = [];
  for (const [roomId, users] of core.state.roomUsers.entries()) rooms.push({ id: roomId, userCount: users.size });
  return rooms;
};

export { joinRoom, leaveRoom, filterClientsByRoom, getRoom, getAllRooms };
