Object.assign(serverManager, {
  renderList: function() {
    var container = document.getElementById('serverIcons');
    if (!container) return;
    var srvs = serverManager._sortedServers();
    var current = state.currentServerId;
    var currentServer = current && srvs.find(function(s) { return s.id === current; });
    var headerEl = document.getElementById('serverHeaderName');
    if (headerEl) headerEl.textContent = currentServer ? currentServer.name : 'Zellous';
    var colors = ['#5865f2', '#57f287', '#feb347', '#fe7168', '#9b59b6', '#1abc9c', '#e67e22', '#e74c3c'];
    var html = '';
    srvs.forEach(function(s) {
      var active = s.id === current ? ' active' : '';
      var color = s.iconColor || colors[s.name.length % colors.length];
      var initial = (s.name || '?')[0].toUpperCase();
      html += '<div class="server-icon' + active + '" draggable="true" data-server="' + s.id + '" title="' + s.name + '" style="background:' + (active ? '' : color) + '">' +
        '<div class="server-pill"></div>' + initial + '</div>';
    });
    html += '<div class="server-separator" id="serverSeparator"></div>' +
      '<div class="server-icon add-server" id="addServerBtn" title="Add a Server"><div class="server-pill"></div>+</div>';
    container.innerHTML = html;

    var homeIcon = document.getElementById('homeServer');
    if (homeIcon) {
      homeIcon.classList.toggle('active', !current);
      homeIcon.addEventListener('click', function() { serverManager.switchTo(null); });
    }

    container.querySelectorAll('[data-server]').forEach(function(el) {
      el.addEventListener('click', function() { serverManager.switchTo(el.dataset.server); });
    });
    var addBtn = document.getElementById('addServerBtn');
    if (addBtn) addBtn.addEventListener('click', function() { serverManager.showCreateModal(); });
    serverManager._initDragDrop(container);
  },

  _initDragDrop: function(container) {
    var dragId = null;
    container.addEventListener('dragstart', function(e) {
      var el = e.target.closest('[data-server]');
      if (!el) return;
      dragId = el.dataset.server;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(function() { el.classList.add('dragging'); }, 0);
    });
    container.addEventListener('dragend', function() {
      container.querySelectorAll('.dragging').forEach(function(el) { el.classList.remove('dragging'); });
      container.querySelectorAll('.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
      dragId = null;
    });
    container.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      var target = e.target.closest('[data-server]');
      container.querySelectorAll('.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
      if (target && target.dataset.server !== dragId) target.classList.add('drag-over');
    });
    container.addEventListener('drop', function(e) {
      e.preventDefault();
      var target = e.target.closest('[data-server]');
      if (!target || !dragId || target.dataset.server === dragId) return;
      var srvs = serverManager._sortedServers();
      var ids = srvs.map(function(s) { return s.id; });
      var fromIdx = ids.indexOf(dragId);
      var toIdx = ids.indexOf(target.dataset.server);
      if (fromIdx === -1 || toIdx === -1) return;
      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, dragId);
      serverManager._saveOrder(ids);
      serverManager.renderList();
    });
  },

  showCreateModal: function() {
    var existing = document.getElementById('serverCreateModal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'serverCreateModal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = '<div class="modal-box" style="max-width:400px">' +
      '<div class="modal-title">Create a Server</div>' +
      '<div class="modal-subtitle">Give your server a name</div>' +
      '<form id="createServerForm" onsubmit="return false">' +
        '<div class="modal-field"><label class="modal-label">Server Name</label>' +
          '<input type="text" class="modal-input" id="newServerName" placeholder="My Server" maxlength="40" autofocus></div>' +
        '<div class="modal-field"><label class="modal-label">Icon Color</label>' +
          '<div class="color-picker" id="serverColorPicker" style="display:flex;gap:6px;flex-wrap:wrap"></div></div>' +
        '<button type="submit" class="modal-btn">Create</button>' +
        '<button type="button" class="modal-btn secondary" id="cancelCreateServer">Cancel</button>' +
      '</form></div>';
    document.body.appendChild(modal);
    var colors = ['#5865f2', '#57f287', '#feb347', '#fe7168', '#9b59b6', '#1abc9c', '#e67e22', '#e74c3c'];
    var selectedColor = colors[0];
    var picker = modal.querySelector('#serverColorPicker');
    colors.forEach(function(c) {
      var dot = document.createElement('div');
      dot.style.cssText = 'width:28px;height:28px;border-radius:50%;background:' + c + ';cursor:pointer;border:3px solid ' + (c === selectedColor ? '#fff' : 'transparent') + ';transition:border 0.15s';
      dot.addEventListener('click', function() {
        selectedColor = c;
        picker.querySelectorAll('div').forEach(function(d) { d.style.borderColor = 'transparent'; });
        dot.style.borderColor = '#fff';
      });
      picker.appendChild(dot);
    });
    modal.querySelector('#newServerName').focus();
    modal.querySelector('#createServerForm').addEventListener('submit', async function() {
      var name = document.getElementById('newServerName').value.trim();
      if (!name) return;
      try {
        await serverManager.create(name, selectedColor);
        modal.remove();
      } catch (e) { console.warn('[Server] Create failed:', e.message); }
    });
    modal.querySelector('#cancelCreateServer').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  }
};

});
