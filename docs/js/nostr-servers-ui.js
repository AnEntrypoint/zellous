serverManager.showContextMenu = function(serverId, x, y) {
  var srv = (state.servers || []).find(function(s) { return s.id === serverId; });
  if (!srv) return;
  var isOwner = srv.ownerId && state.nostrPubkey && srv.ownerId === state.nostrPubkey;
  var items = '<div class="context-menu-item" data-action="invite">Copy Invite Link</div>';
  if (isOwner) items += '<div class="context-menu-item" data-action="edit">Edit Server</div>';
  if (isOwner) items += '<div class="context-menu-item" data-action="create-page">Create Page</div>';
  items += '<div class="context-menu-item danger" data-action="leave">Leave Server</div>';
  if (isOwner) items += '<div class="context-menu-item danger" data-action="delete">Delete Server</div>';
  _mkMenu('serverContextMenu', x, y, items, function(action) {
    if (action === 'invite') {
      var url = location.origin + location.pathname + '?room=' + encodeURIComponent(serverId);
      navigator.clipboard.writeText(url).then(function() {
        if (window.ui && ui.showToast) ui.showToast('Invite link copied!');
      }).catch(function() {
        var el = document.createElement('textarea');
        el.value = url; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove();
        if (window.ui && ui.showToast) ui.showToast('Invite link copied!');
      });
    } else if (action === 'edit') {
      serverManager.showEditModal(serverId);
    } else if (action === 'create-page') {
      serverManager.showCreatePageModal(serverId);
    } else if (action === 'leave') {
      serverManager.leave(serverId);
    } else if (action === 'delete') {
      if (confirm('Delete this server? This cannot be undone.')) serverManager.delete(serverId);
    }
  });
};

serverManager.showCreatePageModal = function(serverId) {
  document.getElementById('pageCreateModal')?.remove();
  var modal = document.createElement('div');
  modal.id = 'pageCreateModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box" style="max-width:400px"><div class="modal-title">Create Page</div>' +
    '<div class="modal-error" id="pcErr" style="display:none"></div><form id="pcForm" onsubmit="return false">' +
    '<div class="modal-field"><label class="modal-label">Page Title</label><input type="text" class="modal-input" id="pcTitle" placeholder="About" maxlength="60" autofocus></div>' +
    '<button type="submit" class="modal-btn" id="pcSubmit">Create Page</button><button type="button" class="modal-btn secondary" id="pcCancel">Cancel</button></form></div>';
  document.body.appendChild(modal);
  _a11yModal(modal);
  var errEl = modal.querySelector('#pcErr'), submitBtn = modal.querySelector('#pcSubmit');
  modal.querySelector('#pcForm').addEventListener('submit', async function() {
    var title = modal.querySelector('#pcTitle').value.trim();
    errEl.style.display = 'none';
    if (!title) { errEl.textContent = 'Page title is required'; errEl.style.display = 'block'; return; }
    var slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
    submitBtn.disabled = true; submitBtn.textContent = 'Creating...';
    try { await window.serverPages.publish(serverId, slug, title, '<p>New page</p>'); modal.remove(); }
    catch (e) { errEl.textContent = e.message || 'Failed'; errEl.style.display = 'block'; submitBtn.disabled = false; submitBtn.textContent = 'Create Page'; }
  });
  modal.querySelector('#pcCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

serverManager.showEditPageModal = function(serverId, slug, title, html) {
  document.getElementById('pageEditModal')?.remove();
  var modal = document.createElement('div');
  modal.id = 'pageEditModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box" style="max-width:520px"><div class="modal-title">Edit Page</div>' +
    '<div class="modal-error" id="peErr" style="display:none"></div><form id="peForm" onsubmit="return false">' +
    '<div class="modal-field"><label class="modal-label">Page Title</label><input type="text" class="modal-input" id="peTitle" value="' + escHtml(title) + '" maxlength="60"></div>' +
    '<div class="modal-field"><label class="modal-label">Content (HTML)</label><textarea class="modal-input" id="peHtml" rows="10" style="font-family:var(--ff-mono,monospace);resize:vertical" autofocus>' + escHtml(html) + '</textarea></div>' +
    '<button type="submit" class="modal-btn" id="peSubmit">Save</button><button type="button" class="modal-btn secondary" id="peCancel">Cancel</button></form></div>';
  document.body.appendChild(modal);
  _a11yModal(modal);
  var errEl = modal.querySelector('#peErr'), submitBtn = modal.querySelector('#peSubmit');
  modal.querySelector('#peForm').addEventListener('submit', async function() {
    var newTitle = modal.querySelector('#peTitle').value.trim() || title;
    var newHtml = modal.querySelector('#peHtml').value;
    errEl.style.display = 'none';
    submitBtn.disabled = true; submitBtn.textContent = 'Saving...';
    try { await window.serverPages.publish(serverId, slug, newTitle, newHtml); modal.remove(); }
    catch (e) { errEl.textContent = e.message || 'Failed'; errEl.style.display = 'block'; submitBtn.disabled = false; submitBtn.textContent = 'Save'; }
  });
  modal.querySelector('#peCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

serverManager.showEditModal = function(serverId) {
  var srv = (state.servers || []).find(function(s) { return s.id === serverId; });
  if (!srv) return;
  document.getElementById('serverEditModal')?.remove();
  var modal = document.createElement('div');
  modal.id = 'serverEditModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box" style="max-width:400px">' +
    '<div class="modal-title">Edit Server</div>' +
    '<form id="editServerForm" onsubmit="return false">' +
      '<div class="modal-field"><label class="modal-label">Server Name</label>' +
        '<input type="text" class="modal-input" id="editServerName" value="' + escHtml(srv.name) + '" maxlength="40" autofocus></div>' +
      '<div class="modal-field"><label class="modal-label">Icon Color</label>' +
        '<div id="editServerColorPicker" style="display:flex;gap:6px;flex-wrap:wrap"></div></div>' +
      '<button type="submit" class="modal-btn">Save</button>' +
      '<button type="button" class="modal-btn secondary" id="cancelEditServer">Cancel</button>' +
    '</form></div>';
  document.body.appendChild(modal);
  _a11yModal(modal);
  var colors = (window.AVATAR_COLORS || ['#3F8A4A']).slice();
  var selectedColor = srv.iconColor || colors[0];
  var picker = modal.querySelector('#editServerColorPicker');
  colors.forEach(function(c) {
    var dot = document.createElement('div');
    dot.style.cssText = 'width:28px;height:28px;border-radius:50%;background:' + c + ';cursor:pointer;border:3px solid ' + (c === selectedColor ? 'var(--fg)' : 'transparent') + ';transition:border 0.15s';
    dot.setAttribute('tabindex', '0');
    dot.setAttribute('role', 'button');
    dot.setAttribute('aria-label', 'Select color ' + c);
    var pick = function() {
      selectedColor = c;
      picker.querySelectorAll('div').forEach(function(d) { d.style.borderColor = 'transparent'; });
      dot.style.borderColor = 'var(--fg)';
    };
    dot.addEventListener('click', pick);
    dot.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      pick();
    });
    picker.appendChild(dot);
  });
  var isAdmin = window.serverRoles && (serverRoles.isOwner(serverId) || serverRoles.isAdmin(serverId));
  if (isAdmin && window.serverSettings) {
    var bitrateField = document.createElement('div');
    bitrateField.className = 'modal-field';
    var curBitrate = serverSettings.getBitrate(serverId);
    bitrateField.innerHTML = '<label class="modal-label">Voice Quality (Opus bitrate)</label>' +
      '<select class="modal-input" id="editServerBitrate">' +
      [8000,16000,24000,48000,96000].map(function(b) {
        return '<option value="' + b + '"' + (b === curBitrate ? ' selected' : '') + '>' + (b/1000) + ' kbps</option>';
      }).join('') + '</select>';
    modal.querySelector('#editServerForm').insertBefore(bitrateField, modal.querySelector('[type="submit"]'));
    var allowlistField = document.createElement('div');
    allowlistField.className = 'modal-field';
    var curAllowlist = serverSettings.getEmbedAllowlist(serverId).join(', ');
    allowlistField.innerHTML = '<label class="modal-label">Embedding Allow List</label>' +
      '<textarea class="modal-input" id="editServerAllowlist" placeholder="example.com, *.example.com, localhost:3000" style="resize:vertical;min-height:60px">' + curAllowlist.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</textarea>' +
      '<div style="font-size:11px;color:var(--text-faint);margin-top:4px">Comma-separated list of domains allowed to embed this server. Leave empty to allow all.</div>';
    modal.querySelector('#editServerForm').insertBefore(allowlistField, modal.querySelector('[type="submit"]'));
  }
  modal.querySelector('#editServerForm').addEventListener('submit', async function() {
    var name = document.getElementById('editServerName').value.trim();
    if (!name) return;
    srv.name = name; srv.iconColor = selectedColor;
    state.servers = state.servers.slice();
    serverManager._persistServers();
    if (srv.ownerId === state.nostrPubkey) {
      try { await serverManager.rename(serverId, name, selectedColor); } catch (e) {}
    }
    if (isAdmin && window.serverSettings) {
      var bitrateEl = document.getElementById('editServerBitrate');
      if (bitrateEl) await serverSettings.setBitrate(serverId, parseInt(bitrateEl.value)).catch(function(){});
      var allowlistEl = document.getElementById('editServerAllowlist');
      if (allowlistEl) await serverSettings.setEmbedAllowlist(serverId, allowlistEl.value).catch(function(){});
    }
    modal.remove(); ui.render.all();
  });
  modal.querySelector('#cancelEditServer').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

serverManager.showJoinPreview = function(serverId, onConfirm) {
  document.getElementById('serverJoinPreviewModal')?.remove();
  var srv = (state.servers || []).find(function(s) { return s.id === serverId; });
  var name = srv ? srv.name : serverId.slice(0, 16) + '...';
  var modal = document.createElement('div');
  modal.id = 'serverJoinPreviewModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box" style="max-width:380px;text-align:center">' +
    '<div class="modal-title">Join Server?</div>' +
    '<div class="modal-subtitle" id="joinPreviewName">' + escHtml(name) + '</div>' +
    '<div style="font-size:11px;color:var(--text-faint);margin-bottom:16px;word-break:break-all">' + serverId + '</div>' +
    '<button class="modal-btn" id="joinPreviewConfirm">Join Server</button>' +
    '<button type="button" class="modal-btn secondary" id="joinPreviewCancel">Cancel</button>' +
    '</div>';
  document.body.appendChild(modal);
  _a11yModal(modal);
  var parts = serverId.split(':');
  if (parts.length >= 2) {
    nostrNet.subscribe('preview-' + serverId, [{ kinds: [34550], '#d': [parts[1]], authors: [parts[0]] }], function(event) {
      var nameTag = event.tags.find(function(t) { return t[0] === 'name'; });
      if (nameTag) { var el = modal.querySelector('#joinPreviewName'); if (el) el.textContent = nameTag[1]; }
    }, function() {});
  }
  modal.querySelector('#joinPreviewConfirm').addEventListener('click', async function() { modal.remove(); await onConfirm(); });
  modal.querySelector('#joinPreviewCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

serverManager.showCreateModal = function() {
  document.getElementById('serverCreateModal')?.remove();
  var modal = document.createElement('div');
  modal.id = 'serverCreateModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box" style="max-width:400px">' +
    '<div class="modal-title">Create a Server</div>' +
    '<div class="modal-subtitle">Give your server a name</div>' +
    '<form id="createServerForm" onsubmit="return false">' +
      '<div class="modal-field"><label class="modal-label">Server Name</label>' +
        '<input type="text" class="modal-input" id="newServerName" placeholder="My Server" maxlength="40" autofocus></div>' +
      '<div class="modal-field"><label class="modal-label">Icon Color</label>' +
        '<div id="serverColorPicker" style="display:flex;gap:6px;flex-wrap:wrap"></div></div>' +
      '<button type="submit" class="modal-btn">Create</button>' +
      '<button type="button" class="modal-btn secondary" id="cancelCreateServer">Cancel</button>' +
    '</form></div>';
  document.body.appendChild(modal);
  _a11yModal(modal);
  var colors = (window.AVATAR_COLORS || ['#3F8A4A']).slice();
  var selectedColor = colors[0];
  var picker = modal.querySelector('#serverColorPicker');
  colors.forEach(function(c) {
    var dot = document.createElement('div');
    dot.style.cssText = 'width:28px;height:28px;border-radius:50%;background:' + c + ';cursor:pointer;border:3px solid ' + (c === selectedColor ? 'var(--fg)' : 'transparent') + ';transition:border 0.15s';
    dot.setAttribute('tabindex', '0');
    dot.setAttribute('role', 'button');
    dot.setAttribute('aria-label', 'Select color ' + c);
    var pick = function() {
      selectedColor = c;
      picker.querySelectorAll('div').forEach(function(d) { d.style.borderColor = 'transparent'; });
      dot.style.borderColor = 'var(--fg)';
    };
    dot.addEventListener('click', pick);
    dot.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      pick();
    });
    picker.appendChild(dot);
  });
  modal.querySelector('#newServerName').focus();
  modal.querySelector('#createServerForm').addEventListener('submit', async function() {
    var name = document.getElementById('newServerName').value.trim();
    if (!name) return;
    try { await serverManager.create(name, selectedColor); modal.remove(); }
    catch (e) { console.warn('[Server] Create failed:', e.message); }
  });
  modal.querySelector('#cancelCreateServer').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

serverManager.renderList = function() {
  var host = document.getElementById('serverIcons');
  if (!host) return;
  var list = state.servers || [];
  var current = state.currentServerId;
  var html = '';
  list.forEach(function(s) {
    var initial = (s.name || '?').trim().charAt(0).toUpperCase();
    var bg = s.iconColor || ((window.AVATAR_COLORS || ['#3F8A4A'])[0]);
    var active = current === s.id ? ' active' : '';
    html += '<div class="server-icon' + active + '" data-server-id="' + s.id + '" style="background:' + escHtml(bg) + '" title="' + escHtml(s.name || '') + '" tabindex="0" role="button" aria-label="' + escHtml(s.name || 'Server') + '">' +
              '<div class="server-pill"></div>' + escHtml(initial) +
            '</div>';
  });
  html += '<div class="server-icon add-server" id="addServerBtn" title="Create server" tabindex="0" role="button" aria-label="Create server">+</div>';
  host.innerHTML = html;
  var activateOnKey = function(el, fn) {
    el.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      fn(e);
    });
  };
  host.querySelectorAll('.server-icon[data-server-id]').forEach(function(el) {
    var sid = el.dataset.serverId;
    var go = function() { serverManager.switchTo(sid); };
    el.addEventListener('click', go);
    activateOnKey(el, go);
    el.addEventListener('contextmenu', function(e) { e.preventDefault(); serverManager.showContextMenu(sid, e.clientX, e.clientY); });
  });
  var addBtn = host.querySelector('#addServerBtn');
  if (addBtn) {
    var create = function() { serverManager.showCreateModal(); };
    addBtn.addEventListener('click', create);
    activateOnKey(addBtn, create);
  }
};
