(() => {
  let pack, unpack;
  try {
    const m = window.msgpackr;
    pack = m.pack; unpack = m.unpack;
  } catch {
    pack = JSON.stringify; unpack = JSON.parse;
  }

  class ZellousSDK {
    constructor() {
      this._ws = null;
      this._listeners = {};
      this._queue = [];
      this._reconnectDelay = 1000;
      this._roomId = null;
      this._token = localStorage.getItem('zellous_token');
      this._audioCtx = null;
      this._mediaStream = null;
      this._scriptProc = null;
      this.auth = {
        login: (username, password, opts = {}) => this._authLogin(username, password, opts),
        logout: () => this._authLogout(),
        getUser: () => this._apiGet('/api/user').then(r => r.user)
      };
      this.messaging = {
        send: (content, channelId = 'general') => this._send({ type: 'text_message', content, channelId }),
        sendImage: (file, caption = '') => this._sendFile(file, caption)
      };
      this.audio = {
        startPTT: () => this._startPTT(),
        stopPTT: () => this._stopPTT()
      };
      this.files = {
        upload: (file, path = '') => this._uploadFile(file, path),
        list: (path = '') => { this._send({ type: 'get_files', path }); }
      };
    }

    connect(roomId) {
      this._roomId = roomId;
      this._token = localStorage.getItem('zellous_token');
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const tokenParam = this._token ? `?token=${encodeURIComponent(this._token)}` : '';
      this._ws = new WebSocket(`${proto}://${location.host}${tokenParam}`);
      this._ws.binaryType = 'arraybuffer';
      this._ws.onopen = () => {
        this._reconnectDelay = 1000;
        this._flushQueue();
        if (roomId) this._send({ type: 'join_room', roomId });
      };
      this._ws.onmessage = (e) => {
        try {
          const msg = typeof e.data === 'string' ? JSON.parse(e.data) : unpack(new Uint8Array(e.data));
          this._emit(msg.type, msg);
          this._emit('*', msg);
        } catch {}
      };
      this._ws.onclose = () => {
        this._emit('disconnected', {});
        setTimeout(() => {
          this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30000);
          this.connect(this._roomId);
        }, this._reconnectDelay);
      };
      this._ws.onerror = () => {};
      return this;
    }

    disconnect() {
      if (this._ws) {
        this._ws.onclose = null;
        this._ws.close();
        this._ws = null;
      }
    }

    on(event, fn) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(fn);
      return this;
    }

    off(event, fn) {
      if (!this._listeners[event]) return;
      this._listeners[event] = this._listeners[event].filter(f => f !== fn);
    }

    send(type, data = {}) {
      this._send({ type, ...data });
    }

    _send(msg) {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
        this._queue.push(msg);
        return;
      }
      try {
        this._ws.send(pack(msg));
      } catch {}
    }

    _flushQueue() {
      while (this._queue.length) {
        this._send(this._queue.shift());
      }
    }

    _emit(event, data) {
      const fns = this._listeners[event] || [];
      fns.forEach(fn => { try { fn(data); } catch {} });
    }

    async _apiGet(path) {
      const headers = {};
      if (this._token) headers['Authorization'] = `Bearer ${this._token}`;
      const r = await fetch(path, { headers });
      return r.json();
    }

    async _apiPost(path, body) {
      const headers = { 'Content-Type': 'application/json' };
      if (this._token) headers['Authorization'] = `Bearer ${this._token}`;
      const r = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
      return r.json();
    }

    async _authLogin(username, password, opts) {
      const result = await this._apiPost('/api/auth/login', { username, password, ...opts });
      if (result.token) {
        this._token = result.token;
        localStorage.setItem('zellous_token', result.token);
        if (result.user) localStorage.setItem('zellous_user', JSON.stringify(result.user));
      }
      return result;
    }

    async _authLogout() {
      await this._apiPost('/api/auth/logout', {});
      this._token = null;
      localStorage.removeItem('zellous_token');
      localStorage.removeItem('zellous_user');
    }

    async _sendFile(file, caption) {
      const reader = new FileReader();
      return new Promise((resolve) => {
        reader.onload = (e) => {
          const data = e.target.result.split(',')[1];
          this._send({ type: 'image_message', filename: file.name, data, caption });
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }

    async _uploadFile(file, path) {
      const reader = new FileReader();
      return new Promise((resolve) => {
        reader.onload = (e) => {
          const data = e.target.result.split(',')[1];
          this._send({ type: 'file_upload_complete', filename: file.name, data, path });
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }

    async _startPTT() {
      if (!this._audioCtx) this._audioCtx = new AudioContext({ sampleRate: 48000 });
      this._mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._send({ type: 'audio_start' });
      const src = this._audioCtx.createMediaStreamSource(this._mediaStream);
      this._scriptProc = this._audioCtx.createScriptProcessor(4096, 1, 1);
      this._scriptProc.onaudioprocess = (e) => {
        const buf = e.inputBuffer.getChannelData(0);
        this._send({ type: 'audio_chunk', data: new Float32Array(buf) });
      };
      src.connect(this._scriptProc);
      this._scriptProc.connect(this._audioCtx.destination);
    }

    _stopPTT() {
      if (this._scriptProc) { this._scriptProc.disconnect(); this._scriptProc = null; }
      if (this._mediaStream) { this._mediaStream.getTracks().forEach(t => t.stop()); this._mediaStream = null; }
      this._send({ type: 'audio_end' });
    }
  }

  const instance = new ZellousSDK();
  if (typeof window !== 'undefined') window.ZellousSDK = instance;
  if (typeof module !== 'undefined') module.exports = instance;
  if (typeof define === 'function' && define.amd) define(() => instance);
})();
