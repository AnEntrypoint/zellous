const channelManager = {
  async create(name, type) {
    const res = await fetch(`/api/rooms/${state.roomId}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth?.getToken() ? { Authorization: 'Bearer ' + auth.getToken() } : {}) },
      body: JSON.stringify({ name, type })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    return (await res.json()).channel;
  },

  async rename(channelId, name) {
    const res = await fetch(`/api/rooms/${state.roomId}/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(auth?.getToken() ? { Authorization: 'Bearer ' + auth.getToken() } : {}) },
      body: JSON.stringify({ name })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    return (await res.json()).channel;
  },

  async remove(channelId) {
    const res = await fetch(`/api/rooms/${state.roomId}/channels/${channelId}`, {
      method: 'DELETE',
      headers: auth?.getToken() ? { Authorization: 'Bearer ' + auth.getToken() } : {}
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    return true;
  },

  showCreateModal(type) {
    const existing = document.getElementById('channelCreateModal');
    if (existing) existing.remove();
    const typeLabel = { text: 'Text', voice: 'Voice', threaded: 'Threaded' }[type] || 'Text';
    const modal = document.createElement('div');
    modal.id = 'channelCreateModal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `<div class="modal-box" style="max-width:360px">
      <div class="modal-title">Create ${typeLabel} Channel</div>
      <div class="modal-error" id="channelCreateError" style="display:none"></div>
      <form id="createChannelForm" onsubmit="return false">
        <div class="modal-field">
          <label class="modal-label">Channel Name</label>
          <input type="text" class="modal-input" id="newChannelName" placeholder="new-channel" maxlength="40" autofocus>
        </div>
        <button type="submit" class="modal-btn" id="createChannelBtn">Create Channel</button>
        <button type="button" class="modal-btn secondary" id="cancelCreateChannel">Cancel</button>
      </form>
    </div>`;
    document.body.appendChild(modal);
    const input = modal.querySelector('#newChannelName');
    const errEl = modal.querySelector('#channelCreateError');
    const submitBtn = modal.querySelector('#createChannelBtn');
    input.focus();

    const showError = (msg) => {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    };

    modal.querySelector('#createChannelForm').addEventListener('submit', async () => {
      const name = input.value.trim();
      errEl.style.display = 'none';
      if (!name) { showError('Channel name is required'); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';
      try {
        await channelManager.create(name, type);
        modal.remove();
      } catch (e) {
        showError(e.message || 'Failed to create channel');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Channel';
      }
    });
    modal.querySelector('#cancelCreateChannel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  },

  showContextMenu(channelId, x, y) {
    channelManager.hideContextMenu();
    const ch = state.channels.find(c => c.id === channelId);
    if (!ch) return;
    const menu = document.createElement('div');
    menu.id = 'channelContextMenu';
    menu.className = 'context-menu';
    menu.style.cssText = `position:fixed;top:${y}px;left:${x}px;z-index:2500`;
    menu.innerHTML = `
      <div class="context-menu-item" data-action="rename">Rename</div>
      <div class="context-menu-item danger" data-action="delete">Delete Channel</div>`;
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';

    menu.addEventListener('click', async (e) => {
      const action = e.target.dataset.action;
      if (action === 'rename') {
        channelManager.hideContextMenu();
        channelManager.showRenameModal(channelId, ch.name);
      } else if (action === 'delete') {
        channelManager.hideContextMenu();
        if (confirm(`Delete #${ch.name}?`)) {
          try { await channelManager.remove(channelId); } catch (e) { console.warn('[Channel] Delete failed:', e.message); }
        }
      }
    });

    const close = (e) => {
      if (!menu.contains(e.target)) { channelManager.hideContextMenu(); document.removeEventListener('click', close); }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  },

  hideContextMenu() {
    document.getElementById('channelContextMenu')?.remove();
  },

  showRenameModal(channelId, currentName) {
    const existing = document.getElementById('channelRenameModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'channelRenameModal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `<div class="modal-box" style="max-width:360px">
      <div class="modal-title">Rename Channel</div>
      <form id="renameChannelForm" onsubmit="return false">
        <div class="modal-field">
          <label class="modal-label">Channel Name</label>
          <input type="text" class="modal-input" id="renameChannelName" value="${currentName}" maxlength="40" autofocus>
        </div>
        <button type="submit" class="modal-btn">Save</button>
        <button type="button" class="modal-btn secondary" id="cancelRenameChannel">Cancel</button>
      </form>
    </div>`;
    document.body.appendChild(modal);
    const input = modal.querySelector('#renameChannelName');
    input.focus();
    input.select();
    modal.querySelector('#renameChannelForm').addEventListener('submit', async () => {
      const name = input.value.trim();
      if (!name || name === currentName) { modal.remove(); return; }
      try {
        await channelManager.rename(channelId, name);
        modal.remove();
      } catch (e) { console.warn('[Channel] Rename failed:', e.message); }
    });
    modal.querySelector('#cancelRenameChannel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }
};

window.channelManager = channelManager;
