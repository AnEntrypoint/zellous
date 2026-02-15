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

  async create(name, iconColor) {
    const token = auth?.getToken();
    const res = await fetch('/api/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify({ name, iconColor })
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
    ui.render.channels?.();
    if (serverId) {
      const srv = state.servers.find(s => s.id === serverId);
      if (srv) ui.serverHeader.textContent = srv.name;
      state.roomId = serverId;
    } else {
      ui.serverHeader.textContent = 'Zellous';
      state.roomId = new URLSearchParams(window.location.search).get('room') || 'lobby';
    }
    if (state.voiceConnected && window.lk) lk.disconnect();
    network.switchRoom(state.roomId);
    serverManager.renderList();
    serverManager.loadChannels(state.roomId);
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
      const cur = state.currentChannel;
      const match = channels.find(c => c.id === cur?.id);
      state.currentChannel = match || channels[0] || { id: 'general', type: 'text', name: 'general' };
      ui.render.channels?.();
      ui.render.channelView?.();
    } catch (e) { console.warn('[Servers] Channel load failed:', e.message); }
  },

  renderList() {
    const container = document.getElementById('serverIcons');
    if (!container) return;
    const srvs = state.servers || [];
    const current = state.currentServerId;
    const colors = ['#5865f2', '#57f287', '#feb347', '#fe7168', '#9b59b6', '#1abc9c', '#e67e22', '#e74c3c'];

    let html = '';
    srvs.forEach(s => {
      const active = s.id === current ? ' active' : '';
      const color = s.iconColor || colors[s.name.length % colors.length];
      const initial = (s.name || '?')[0].toUpperCase();
      html += `<div class="server-icon${active}" data-server="${s.id}" title="${s.name}" style="background:${active ? '' : color}">
        <div class="server-pill"></div>${initial}
      </div>`;
    });
    html += `<div class="server-separator"></div>
      <div class="server-icon add-server" id="addServerBtn" title="Add a Server">
        <div class="server-pill"></div>+
      </div>`;
    container.innerHTML = html;

    const homeIcon = document.getElementById('homeServer');
    if (homeIcon) {
      homeIcon.classList.toggle('active', !current);
      homeIcon.addEventListener('click', () => serverManager.switchTo(null));
    }

    container.querySelectorAll('[data-server]').forEach(el => {
      el.addEventListener('click', () => serverManager.switchTo(el.dataset.server));
    });
    document.getElementById('addServerBtn')?.addEventListener('click', () => serverManager.showCreateModal());
  },

  showCreateModal() {
    const existing = document.getElementById('serverCreateModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'serverCreateModal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `<div class="modal-box" style="max-width:400px">
      <div class="modal-title">Create a Server</div>
      <div class="modal-subtitle">Give your server a name</div>
      <form id="createServerForm" onsubmit="return false">
        <div class="modal-field">
          <label class="modal-label">Server Name</label>
          <input type="text" class="modal-input" id="newServerName" placeholder="My Server" maxlength="40" autofocus>
        </div>
        <div class="modal-field">
          <label class="modal-label">Icon Color</label>
          <div class="color-picker" id="serverColorPicker" style="display:flex;gap:6px;flex-wrap:wrap"></div>
        </div>
        <button type="submit" class="modal-btn">Create</button>
        <button type="button" class="modal-btn secondary" id="cancelCreateServer">Cancel</button>
      </form>
    </div>`;
    document.body.appendChild(modal);

    const colors = ['#5865f2', '#57f287', '#feb347', '#fe7168', '#9b59b6', '#1abc9c', '#e67e22', '#e74c3c'];
    let selectedColor = colors[0];
    const picker = modal.querySelector('#serverColorPicker');
    colors.forEach(c => {
      const dot = document.createElement('div');
      dot.style.cssText = `width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c === selectedColor ? '#fff' : 'transparent'};transition:border 0.15s`;
      dot.addEventListener('click', () => {
        selectedColor = c;
        picker.querySelectorAll('div').forEach(d => d.style.borderColor = 'transparent');
        dot.style.borderColor = '#fff';
      });
      picker.appendChild(dot);
    });

    modal.querySelector('#newServerName').focus();
    modal.querySelector('#createServerForm').addEventListener('submit', async () => {
      const name = document.getElementById('newServerName').value.trim();
      if (!name) return;
      try {
        const srv = await serverManager.create(name, selectedColor);
        modal.remove();
        serverManager.switchTo(srv.id);
      } catch (e) { console.warn('[Server] Create failed:', e.message); }
    });
    modal.querySelector('#cancelCreateServer').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }
};

window.serverManager = serverManager;
