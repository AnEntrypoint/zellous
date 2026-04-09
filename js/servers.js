const serverManager = {
  async loadServers() {
    try {
      const token = auth?.getToken();
      const res = await fetch('/api/servers', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
      if (!res.ok) return;
      const data = await res.json();
      state.servers = data.servers || [];
      serverManager.renderList();
    } catch (e) { console.warn('[Servers] Load failed:', e.message); }
  },

  async create(name, iconColor, type = 'community', url = null) {
    const token = auth?.getToken();
    const res = await fetch('/api/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify({ name, iconColor, type, url })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const data = await res.json();
    await serverManager.loadServers();
    return data.server;
  },

  async join(serverId) {
    const token = auth?.getToken();
    const res = await fetch(`/api/servers/${serverId}/join`, {
      method: 'POST',
      headers: token ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } : { 'Content-Type': 'application/json' }
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    await serverManager.loadServers();
  },

  async switchTo(serverId) {
    state.currentServerId = serverId;
    localStorage.setItem('zellous_lastServer', serverId || '');
    state.channels = [];
    state.currentChannel = { id: 'general', type: 'text', name: 'general' };
    state.chatMessages = [];
    state.roomMembers = [];

    const srv = serverId ? state.servers.find(s => s.id === serverId) : null;
    const srvType = srv?.type || 'community';

    if (serverId) {
      if (srv) {
        const headerNameEl = document.getElementById('serverHeaderName');
        if (headerNameEl) headerNameEl.textContent = srv.name;
        else if (ui.serverHeader) ui.serverHeader.textContent = srv.name;
      }
      state.roomId = serverId;
    } else {
      const headerNameEl = document.getElementById('serverHeaderName');
      if (headerNameEl) headerNameEl.textContent = 'Zellous';
      else if (ui.serverHeader) ui.serverHeader.textContent = 'Zellous';
      state.roomId = new URLSearchParams(window.location.search).get('room') || 'lobby';
    }

    if (state.voiceConnected && window.lk) lk.disconnect();

    const sidebar = document.getElementById('channelSidebar');
    const mainContent = document.getElementById('mainContent');
    const pageView = document.getElementById('pageView');
    const pageFrame = document.getElementById('pageViewFrame');

    if (srvType === 'page' && srv?.url) {
      if (sidebar) sidebar.style.display = 'none';
      if (pageView) { pageView.style.display = 'flex'; pageView.style.flex = '1'; }
      if (pageFrame) pageFrame.src = srv.url;
      serverManager.renderList();
    } else {
      if (sidebar) sidebar.style.display = '';
      if (pageView) pageView.style.display = 'none';
      if (pageFrame) pageFrame.src = 'about:blank';
      serverManager.renderList();
      if (srvType !== 'page') {
        network.switchRoom(state.roomId);
        serverManager.loadChannels(state.roomId);
        ui.render.channels?.();
      }
    }
  },

  async loadChannels(roomId) {
    try {
      const token = auth?.getToken();
      const res = await fetch(`/api/rooms/${roomId}/channels`, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
      if (!res.ok) return;
      const data = await res.json();
      if (state.roomId !== roomId) return;
      const channels = data.channels || [];
      state.channels = channels;
      const prev = state.currentChannel?.id;
      const cur = state.currentChannel;
      const match = channels.find(c => c.id === cur?.id);
      state.currentChannel = match || channels[0] || { id: 'general', type: 'text', name: 'general' };
      ui.render.channels?.();
      ui.render.channelView?.();
      if (state.currentChannel?.id !== prev && state.currentChannel?.type === 'text') {
        state.chatMessages = [];
        network.send({ type: 'get_messages', limit: 50, channelId: state.currentChannel.id });
      }
    } catch (e) { console.warn('[Servers] Channel load failed:', e.message); }
  },

  _getOrder() {
    try { return JSON.parse(localStorage.getItem('zellous_serverOrder') || '[]'); } catch { return []; }
  },

  _saveOrder(ids) {
    localStorage.setItem('zellous_serverOrder', JSON.stringify(ids));
  },

  _sortedServers() {
    const srvs = state.servers || [];
    const order = serverManager._getOrder();
    if (!order.length) return srvs;
    const indexed = new Map(order.map((id, i) => [id, i]));
    return [...srvs].sort((a, b) => {
      const ai = indexed.has(a.id) ? indexed.get(a.id) : Infinity;
      const bi = indexed.has(b.id) ? indexed.get(b.id) : Infinity;
      return ai - bi;
    });
  },

};

window.serverManager = serverManager;
