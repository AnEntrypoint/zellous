const debugStructure = {
  init() {
    window.__debug = {
      ui: {
        activeView: 'chat',
        sidebarExpanded: true,
        modalOpen: false,
        currentChannel: null,
        currentServer: null
      },
      voice: {
        fsm: null,
        participants: [],
        rttMatrix: {},
        hubPeer: null
      },
      relay: {
        connected: 0,
        total: 0,
        connections: {},
        latencyPercentiles: {}
      },
      cache: {
        messagesCount: 0,
        channelsCount: 0,
        unreadCounts: {}
      },
      user: {
        pubkey: null,
        username: null,
        displayName: null,
        isOnline: false
      },
      errors: [],
      perf: {
        lastRenderTime: 0,
        avgRelayLatency: 0
      },
      
      log(subsystem, level, message) {
        this.errors.push({timestamp: Date.now(), subsystem, level, message});
        if (this.errors.length > 20) this.errors.shift();
      }
    };
    
    this._wireVoice();
    this._wireRelay();
    this._wireUI();
  },
  
  _wireVoice() {
    if (window.nostrVoice) {
      setInterval(() => {
        window.__debug.voice.fsm = window.nostrVoice._fsm?.getSnapshot?.()?.value || 'unknown';
        window.__debug.voice.participants = Object.keys(window.nostrVoice._peers || {}).length;
      }, 500);
    }
  },
  
  _wireRelay() {
    setInterval(() => {
      if (window.__debugNet?.relays) {
        const relays = window.__debugNet.relays;
        window.__debug.relay.connected = relays.filter(r => r.status === 'connected').length;
        window.__debug.relay.total = relays.length;
      }
    }, 1000);
  },
  
  _wireUI() {
    const msgContainer = document.querySelector('.messages-container, #chatMessages');
    if (msgContainer) {
      const observer = new MutationObserver(() => {
        window.__debug.ui.currentChannel = window.state?.currentChannelId || null;
        const msgs = msgContainer.querySelectorAll('.message');
        window.__debug.cache.messagesCount = msgs.length;
      });
      observer.observe(msgContainer, {childList: true});
    }
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => debugStructure.init());
} else {
  debugStructure.init();
}
