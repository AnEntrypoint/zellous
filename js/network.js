const network = {
  _reconnectDelay: 1000,
  _reconnectMax: 30000,
  _pendingRoomId: null,
  connect: () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = auth?.getToken();
    const url = token
      ? `${protocol}//${window.location.host}?token=${encodeURIComponent(token)}`
      : `${protocol}//${window.location.host}`;

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    state.ws = ws;
    ws.onopen = () => {
      state.connectionStatus = 'Connected';
      state.isConnected = true;
      network._reconnectDelay = 1000;
      network._pendingRoomId = state.roomId;
      network.send({ type: 'join_room', roomId: state.roomId });
    };
    ws.onmessage = (e) => { try { message.handle(msgpackr.unpack(new Uint8Array(e.data))); } catch (_) {} };
    ws.onerror = () => {
      state.connectionStatus = 'Error';
      state.isConnected = false;
    };
    ws.onclose = () => {
      state.connectionStatus = 'Disconnected';
      state.isConnected = false;
      const delay = network._reconnectDelay;
      network._reconnectDelay = Math.min(delay * 2, network._reconnectMax);
      setTimeout(network.connect, delay);
    };
  },
  reconnect: () => {
    const ws = state.ws;
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
      state.ws = null;
    }
    state.isConnected = false;
    network._reconnectDelay = 1000;
    network.connect();
  },
  switchRoom: (roomId) => {
    state.roomId = roomId;
    network._pendingRoomId = roomId;
    if (state.ws?.readyState === WebSocket.OPEN) {
      network.send({ type: 'join_room', roomId });
    } else {
      network.reconnect();
    }
  },
  send: (msg) => {
    if (state.ws?.readyState === WebSocket.OPEN) {
      state.ws.send(msgpackr.pack({ ...msg, roomId: state.roomId }));
    }
  },
  sendAudio: (msg) => {
    if (window.lk?.isDataChannelReady()) {
      if (msg.type === 'audio_chunk') {
        lk.sendData('audio_chunk', new Uint8Array(msg.data), true);
      } else {
        lk.sendData(msg.type, JSON.stringify({ type: msg.type }), true);
      }
      network.send(msg);
      return;
    }
    network.send(msg);
  }
};


const message = {
  handlers: {},


  handle: (m) => {
    const h = message.handlers[m.type];
    if (h) h(m);
  },

  add: (text, audioData = null, userId = null, username = null) => {
    const id = Date.now() + Math.random();
    const m = { id, text, time: Date.now(), userId, username };
    if (audioData?.length) {
      m.hasAudio = true;
      const history = new Map(state.audioHistory);
      history.set(id, audioData);
      state.audioHistory = history;
    }
    const messages = [...state.messages, m];
    if (messages.length > 50) {
      const r = messages.shift();
      if (r.hasAudio) {
        const history = new Map(state.audioHistory);
        history.delete(r.id);
        state.audioHistory = history;
      }
    }
    state.messages = messages;
    ui.render.messages();
  }
};

window.network = network;
window.message = message;

window.network = network;
window.message = message;
