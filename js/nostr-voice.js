var nostrVoice = {
  _iframe: null, _apiKey: null, _channelName: '', _roomId: '',
  _presenceInterval: null, _participants: new Map(),

  async _deriveRoomId(channelName) {
    var input = (state.currentServerId || 'default') + ':voice:' + channelName;
    var hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return 'zellous' + Array.from(new Uint8Array(hash)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('').slice(0, 16);
  },

  _displayName: function() {
    return state.nostrProfile?.name || (state.nostrPubkey ? auth.npubShort(state.nostrPubkey) : 'Guest');
  },

  async connect(channelName) {
    if (nostrVoice._iframe) await nostrVoice.disconnect();
    nostrVoice._channelName = channelName;
    state.voiceConnectionState = 'connecting';
    try {
      nostrVoice._roomId = await nostrVoice._deriveRoomId(channelName);
      nostrVoice._apiKey = 'zellous' + Date.now();
      var name = nostrVoice._displayName();
      var url = 'https://vdo.ninja/?' + new URLSearchParams({
        room: nostrVoice._roomId, push: '', audioonly: '', label: name,
        cleanoutput: '', api: nostrVoice._apiKey, nocontrols: ''
      }).toString();
      var iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.allow = 'microphone;autoplay;camera';
      iframe.style.cssText = 'width:1px;height:1px;position:absolute;opacity:0;pointer-events:none';
      document.body.appendChild(iframe);
      nostrVoice._iframe = iframe;
      window.addEventListener('message', nostrVoice._onMessage);
      nostrVoice._participants.clear();
      nostrVoice._participants.set('local', {
        identity: name, isSpeaking: false, isMuted: false,
        isLocal: true, hasVideo: false, connectionQuality: 'good'
      });
      state.voiceConnected = true;
      state.voiceConnectionState = 'connected';
      state.voiceConnectionQuality = 'good';
      state.voiceChannelName = channelName;
      state.voiceReconnectAttempts = 0;
      state.dataChannelAvailable = false;
      nostrVoice.updateParticipants();
      nostrVoice._publishPresence('join');
      nostrVoice._startHeartbeat();
      nostrVoice._subscribePresence();
      if (ui.voicePanel) ui.voicePanel.classList.add('visible');
      if (ui.voicePanelChannel) ui.voicePanelChannel.textContent = channelName;
      message.add('Voice connected via VDO.Ninja');
    } catch (e) {
      console.warn('[nostr-voice] Connect failed:', e.message);
      state.voiceConnected = false;
      state.voiceConnectionState = 'disconnected';
      message.add('Voice connection failed: ' + e.message);
    }
  },

  async disconnect() {
    nostrVoice._publishPresence('leave');
    window.removeEventListener('message', nostrVoice._onMessage);
    if (nostrVoice._iframe) { nostrVoice._iframe.remove(); nostrVoice._iframe = null; }
    nostrVoice._stopHeartbeat();
    if (nostrVoice._roomId) nostrNet.unsubscribe('voice-presence-' + nostrVoice._roomId);
    nostrVoice._participants.clear();
    nostrVoice._roomId = '';
    nostrVoice._channelName = '';
    state.voiceConnected = false;
    state.voiceConnectionState = 'disconnected';
    state.voiceConnectionQuality = 'unknown';
    state.voiceChannelName = '';
    state.voiceParticipants = [];
    state.voiceReconnectAttempts = 0;
    state.micMuted = false;
    state.voiceDeafened = false;
    state.activeSpeakers = new Set();
    if (ui.voicePanel) ui.voicePanel.classList.remove('visible');
    nostrVoice.updateParticipants();
  },

  toggleMic: function() {
    if (!nostrVoice._iframe) return;
    state.micMuted = !state.micMuted;
    nostrVoice._post({ action: state.micMuted ? 'mute' : 'unmute' });
    var local = nostrVoice._participants.get('local');
    if (local) local.isMuted = state.micMuted;
    nostrVoice.updateParticipants();
    document.getElementById('micToggleBtn')?.classList.toggle('muted', state.micMuted);
    document.getElementById('voiceMicBtn')?.classList.toggle('active', !state.micMuted);
  },

  toggleDeafen: function() {
    state.voiceDeafened = !state.voiceDeafened;
    nostrVoice._post({ action: 'speaker', value: !state.voiceDeafened });
    document.getElementById('deafenToggleBtn')?.classList.toggle('muted', state.voiceDeafened);
    document.getElementById('voiceDeafenBtn')?.classList.toggle('active', state.voiceDeafened);
    nostrVoice.updateParticipants();
  },

  toggleCamera: function() {
    message.add('Camera not available in VDO.Ninja audio-only mode');
  },

  _post: function(msg) {
    if (!nostrVoice._iframe?.contentWindow) return;
    try { nostrVoice._iframe.contentWindow.postMessage(msg, '*'); } catch (e) {}
  },

  _onMessage: function(event) {
    if (!event.data || typeof event.data !== 'object') return;
    var d = event.data;
    if (d.action === 'guest-connected') {
      nostrVoice._participants.set(d.value, {
        identity: d.label || d.value || 'Peer', isSpeaking: false, isMuted: false,
        isLocal: false, hasVideo: false, connectionQuality: 'good'
      });
      nostrVoice.updateParticipants();
    } else if (d.action === 'guest-disconnected') {
      nostrVoice._participants.delete(d.value);
      nostrVoice.updateParticipants();
    }
  },

  updateParticipants: function() {
    var list = [];
    nostrVoice._participants.forEach(function(p) { list.push(p); });
    state.voiceParticipants = list;
    if (window.uiVoice) { uiVoice.renderGrid(); uiVoice.renderPanel(); }
    if (window.uiChannels) uiChannels.render();
  },

  async _publishPresence(action) {
    if (!auth.isLoggedIn() || !nostrVoice._roomId) return;
    var template = {
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', 'zellous-voice:' + nostrVoice._roomId],
        ['action', action], ['channel', nostrVoice._channelName],
        ['server', state.currentServerId || '']
      ],
      content: JSON.stringify({
        action: action, name: nostrVoice._displayName(),
        channel: nostrVoice._channelName, ts: Date.now()
      })
    };
    nostrNet.publish(await auth.sign(template));
  },

  _startHeartbeat: function() {
    nostrVoice._stopHeartbeat();
    nostrVoice._presenceInterval = setInterval(function() {
      if (state.voiceConnected) nostrVoice._publishPresence('heartbeat');
    }, 30000);
  },

  _stopHeartbeat: function() {
    if (nostrVoice._presenceInterval) { clearInterval(nostrVoice._presenceInterval); nostrVoice._presenceInterval = null; }
  },

  _subscribePresence: function() {
    if (!nostrVoice._roomId) return;
    var subId = 'voice-presence-' + nostrVoice._roomId;
    nostrNet.subscribe(subId,
      [{ kinds: [30078], '#d': ['zellous-voice:' + nostrVoice._roomId], since: Math.floor(Date.now() / 1000) - 60 }],
      function(event) {
        if (event.pubkey === state.nostrPubkey) return;
        try {
          var data = JSON.parse(event.content);
          if (Date.now() - (data.ts || 0) > 90000) return;
          var peerId = 'nostr-' + event.pubkey.slice(0, 12);
          if (data.action === 'leave') {
            nostrVoice._participants.delete(peerId);
          } else {
            nostrVoice._participants.set(peerId, {
              identity: data.name || auth.npubShort(event.pubkey),
              isSpeaking: false, isMuted: false, isLocal: false,
              hasVideo: false, connectionQuality: 'good'
            });
          }
          nostrVoice.updateParticipants();
        } catch (e) {}
      },
      function() {}
    );
  },

  isDataChannelReady: function() { return false; },
  updateVoiceGrid: function() { nostrVoice.updateParticipants(); }
};

window.lk = nostrVoice;
window.nostrVoice = nostrVoice;
