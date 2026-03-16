const EVENT_TYPES = Object.freeze({
  CLIENT_CONNECTED: 'clientConnected',
  CLIENT_DISCONNECTED: 'clientDisconnected',
  USER_AUTHENTICATED: 'userAuthenticated',
  USER_JOINED_ROOM: 'userJoinedRoom',
  USER_LEFT_ROOM: 'userLeftRoom',
  ROOM_CREATED: 'roomCreated',
  ROOM_EMPTY: 'roomEmpty',
  AUDIO_STARTED: 'audioStarted',
  AUDIO_ENDED: 'audioEnded',
  TEXT_MESSAGE: 'textMessage',
  FILE_SHARED: 'fileShared',
  BOT_JOINED: 'botJoined',
  BOT_LEFT: 'botLeft',
  UNKNOWN_MESSAGE: 'unknownMessage',
  ERROR: 'error',
});

export { EVENT_TYPES };
