Object.assign(serverManager, {
  renderList() {
    const container = document.getElementById('serverIcons');
    if (!container) return;
    const srvs = serverManager._sortedServers();
    const current = state.currentServerId;
    const colors = ['#5865f2', '#57f287', '#feb347', '#fe7168', '#9b59b6', '#1abc9c', '#e67e22', '#e74c3c'];

    let html = '';
    srvs.forEach(s => {
      const active = s.id === current ? ' active' : '';
      const color = s.iconColor || colors[s.name.length % colors.length];
      const initial = (s.name || '?')[0].toUpperCase();
      html += `<div class="server-icon${active}" draggable="true" data-server="${s.id}" title="${s.name}" style="background:${active ? '' : color}">
        <div class="server-pill"></div>${initial}
      </div>`;
    });
    html += `<div class="server-separator" id="serverSeparator"></div>
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
    serverManager._initDragDrop(container);
  },

  _initDragDrop(container) {
    let dragId = null;

    container.addEventListener('dragstart', (e) => {
      const el = e.target.closest('[data-server]');
      if (!el) return;
      dragId = el.dataset.server;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => el.classList.add('dragging'), 0);
    });

    container.addEventListener('dragend', (e) => {
      container.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
      container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      dragId = null;
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const target = e.target.closest('[data-server]');
      container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      if (target && target.dataset.server !== dragId) target.classList.add('drag-over');
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      const target = e.target.closest('[data-server]');
      if (!target || !dragId || target.dataset.server === dragId) return;
      const srvs = serverManager._sortedServers();
      const ids = srvs.map(s => s.id);
      const fromIdx = ids.indexOf(dragId);
      const toIdx = ids.indexOf(target.dataset.server);
      if (fromIdx === -1 || toIdx === -1) return;
      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, dragId);
      serverManager._saveOrder(ids);
      serverManager.renderList();
    });
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
          <label class="modal-label">Server Type</label>
          <select class="modal-input" id="newServerType">
            <option value="community">Community (channels + chat)</option>
            <option value="page">Page (embed a URL)</option>
          </select>
        </div>
        <div class="modal-field" id="serverUrlField" style="display:none">
          <label class="modal-label">Page URL</label>
          <input type="url" class="modal-input" id="newServerUrl" placeholder="https://example.com">
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
    modal.querySelector('#newServerType').addEventListener('change', (e) => {
      const urlField = document.getElementById('serverUrlField');
      if (urlField) urlField.style.display = e.target.value === 'page' ? 'block' : 'none';
    });
    modal.querySelector('#createServerForm').addEventListener('submit', async () => {
      const name = document.getElementById('newServerName').value.trim();
      const sType = document.getElementById('newServerType').value;
      const sUrl = document.getElementById('newServerUrl').value.trim();
      if (!name) return;
      if (sType === 'page' && !sUrl) { document.getElementById('newServerUrl').focus(); return; }
      try {
        const srv = await serverManager.create(name, selectedColor, sType, sUrl || null);
        modal.remove();
        serverManager.switchTo(srv.id);
      } catch (e) { console.warn('[Server] Create failed:', e.message); }
    });
    modal.querySelector('#cancelCreateServer').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }
};

});
