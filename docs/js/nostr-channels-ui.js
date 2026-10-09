function _a11yModal(modal) {
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  var trigger = document.activeElement;
  var restoreFocus = function() {
    if (trigger && document.body.contains(trigger) && typeof trigger.focus === 'function') trigger.focus();
  };
  var origRemove = modal.remove.bind(modal);
  modal.remove = function() { origRemove(); restoreFocus(); };
  var FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
  var onKeydown = function(e) {
    if (e.key === 'Escape') { e.preventDefault(); modal.remove(); return; }
    if (e.key !== 'Tab') return;
    var focusable = Array.prototype.slice.call(modal.querySelectorAll(FOCUSABLE));
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  modal.addEventListener('keydown', onKeydown);
  setTimeout(function() {
    var first = modal.querySelector(FOCUSABLE);
    if (first) first.focus();
  }, 0);
}

function _a11yPersistentModal(modal, onClose) {
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  var trigger = document.activeElement;
  var FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
  var restoreFocus = function() {
    if (trigger && document.body.contains(trigger) && typeof trigger.focus === 'function') trigger.focus();
  };
  if (!modal._a11yPersistentWired) {
    modal._a11yPersistentWired = true;
    modal.addEventListener('keydown', function(e) {
      if (getComputedStyle(modal).display === 'none') return;
      if (e.key === 'Escape') { e.preventDefault(); modal._a11yOnClose && modal._a11yOnClose(); return; }
      if (e.key !== 'Tab') return;
      var focusable = Array.prototype.slice.call(modal.querySelectorAll(FOCUSABLE));
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  modal._a11yOnClose = function() { onClose(); modal._a11yRestoreFocus && modal._a11yRestoreFocus(); };
  modal._a11yRestoreFocus = restoreFocus;
  setTimeout(function() {
    var first = modal.querySelector(FOCUSABLE);
    if (first) first.focus();
  }, 0);
}

function _invalidInput(el) {
  if (!el) return;
  el.classList.remove('input-invalid');
  void el.offsetWidth;
  el.classList.add('input-invalid');
  el.focus();
  setTimeout(function() { el.classList.remove('input-invalid'); }, 500);
}

var _mkMenu = function(id, x, y, html, onAction) {
  document.getElementById(id)?.remove();
  var trigger = document.activeElement;
  var menu = document.createElement('div');
  menu.id = id; menu.className = 'context-menu open';
  menu.style.cssText = 'position:fixed;top:' + y + 'px;left:' + x + 'px;z-index:2500';
  var menuLabel = id.replace(/ContextMenu$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', (menuLabel.charAt(0).toUpperCase() + menuLabel.slice(1) || 'Context') + ' actions');
  menu.innerHTML = html;
  document.body.appendChild(menu);
  var r = menu.getBoundingClientRect();
  if (r.right > window.innerWidth) menu.style.left = (window.innerWidth - r.width - 8) + 'px';
  if (r.bottom > window.innerHeight) menu.style.top = (window.innerHeight - r.height - 8) + 'px';
  var items = menu.querySelectorAll('.context-menu-item');
  items.forEach(function(it) { it.setAttribute('tabindex', '0'); it.setAttribute('role', 'menuitem'); });
  menu.addEventListener('click', function(e) { var action = e.target.dataset.action; if (!action) return; closeMenu(); onAction(action, menu); });
  menu.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target.classList && e.target.classList.contains('context-menu-item')) {
        e.preventDefault();
        var action = e.target.dataset.action;
        closeMenu();
        onAction(action, menu);
      }
      return;
    }
    if (e.key === 'Escape') { closeMenu(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    var list = Array.prototype.slice.call(items);
    var idx = list.indexOf(document.activeElement);
    var next = e.key === 'ArrowDown' ? (idx + 1) % list.length : (idx - 1 + list.length) % list.length;
    list[next]?.focus();
  });
  var closeMenu = function() {
    menu.remove();
    document.removeEventListener('click', close);
    document.removeEventListener('keydown', onDocKeydown);
    if (trigger && document.body.contains(trigger) && typeof trigger.focus === 'function') trigger.focus();
  };
  var close = function(e) { if (!menu.contains(e.target)) closeMenu(); };
  var onDocKeydown = function(e) { if (e.key === 'Escape' && !menu.contains(document.activeElement)) closeMenu(); };
  setTimeout(function() {
    document.addEventListener('click', close);
    document.addEventListener('keydown', onDocKeydown);
    items[0]?.focus();
  }, 0);
};

channelManager.showCreateModal = function(type, categoryId) {
  document.getElementById('channelCreateModal')?.remove();
  var cats = state.categories || [];
  var catOpts = cats.map(function(c) { return '<option value="' + escHtml(c.id) + '"' + (c.id === categoryId ? ' selected' : '') + '>' + escHtml(c.name) + '</option>'; }).join('');
  var modal = document.createElement('div');
  modal.id = 'channelCreateModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box" style="max-width:400px"><div class="modal-title">Create Channel</div>' +
    '<div class="modal-error" id="ccErr" style="display:none"></div><form id="ccForm" onsubmit="return false">' +
    '<div class="modal-field"><label class="modal-label">Channel Type</label><select class="modal-input" id="ccType"><option value="text">Text</option><option value="voice">Voice</option><option value="threaded">Threaded</option><option value="announcement">Announcement</option></select></div>' +
    '<div class="modal-field"><label class="modal-label">Channel Name</label><input type="text" class="modal-input" id="ccName" placeholder="new-channel" maxlength="40" autofocus></div>' +
    '<div class="modal-field"><label class="modal-label">Category</label><select class="modal-input" id="ccCat"><option value="">No Category</option>' + catOpts + '</select></div>' +
    '<div class="modal-actions"><button type="button" class="modal-btn secondary" id="ccCancel">Cancel</button><button type="submit" class="modal-btn" id="ccSubmit">Create Channel</button></div></form></div>';
  document.body.appendChild(modal);
  _a11yModal(modal);
  var errEl = modal.querySelector('#ccErr'), submitBtn = modal.querySelector('#ccSubmit');
  modal.querySelector('#ccForm').addEventListener('submit', async function() {
    var name = modal.querySelector('#ccName').value.trim();
    errEl.style.display = 'none';
    if (!name) { errEl.textContent = 'Channel name is required'; errEl.style.display = 'block'; return; }
    submitBtn.disabled = true; submitBtn.textContent = 'Creating...';
    try { await channelManager.create(name, modal.querySelector('#ccType').value, modal.querySelector('#ccCat').value || null); modal.remove(); }
    catch (e) { errEl.textContent = e.message || 'Failed'; errEl.style.display = 'block'; submitBtn.disabled = false; submitBtn.textContent = 'Create Channel'; }
  });
  modal.querySelector('#ccCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

channelManager.showRenameModal = function(channelId, currentName) {
  document.getElementById('channelRenameModal')?.remove();
  var modal = document.createElement('div');
  modal.id = 'channelRenameModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box" style="max-width:360px"><div class="modal-title">Rename Channel</div>' +
    '<form id="crForm" onsubmit="return false"><div class="modal-field"><label class="modal-label">Channel Name</label>' +
    '<input type="text" class="modal-input" id="crName" value="' + escHtml(currentName) + '" maxlength="40" autofocus></div>' +
    '<div class="modal-actions"><button type="button" class="modal-btn secondary" id="crCancel">Cancel</button><button type="submit" class="modal-btn">Save</button></div></form></div>';
  document.body.appendChild(modal);
  _a11yModal(modal);
  var input = modal.querySelector('#crName'); input.focus(); input.select();
  modal.querySelector('#crForm').addEventListener('submit', async function() {
    var name = input.value.trim();
    if (!name || name === currentName) { modal.remove(); return; }
    try { await channelManager.rename(channelId, name); modal.remove(); } catch (e) { window.ui && window.ui.showToast && window.ui.showToast('Rename failed: ' + (e && e.message || 'unknown'), 3000, 'error'); }
  });
  modal.querySelector('#crCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

channelManager.showDeleteConfirm = function(channelId) {
  var ch = (state.channels || []).find(function(c) { return c.id === channelId; });
  if (!ch) return;
  ui.confirm({ title: 'Delete #' + ch.name + '?', message: 'Messages in this channel will no longer be listed.', confirmLabel: 'Delete', danger: true }).then(function(yes) {
    if (yes) channelManager.remove(channelId).catch(function(e) { if (window.ui && ui.showToast) ui.showToast(e && e.message || 'Delete failed', 3000, 'error'); });
  });
};

channelManager.showNewForumPostModal = function() {
  document.getElementById('forumPostModal')?.remove();
  var modal = document.createElement('div');
  modal.id = 'forumPostModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box" style="max-width:480px"><div class="modal-title">New Forum Post</div>' +
    '<div class="modal-error" id="fpErr" style="display:none"></div><form id="fpForm" onsubmit="return false">' +
    '<div class="modal-field"><label class="modal-label">Title</label><input type="text" class="modal-input" id="fpTitle" placeholder="Post title" maxlength="120" autofocus></div>' +
    '<div class="modal-field"><label class="modal-label">Body</label><textarea class="modal-input" id="fpBody" rows="8" style="resize:vertical" placeholder="Write your post..."></textarea></div>' +
    '<div class="modal-actions"><button type="button" class="modal-btn secondary" id="fpCancel">Cancel</button><button type="submit" class="modal-btn" id="fpSubmit">Post</button></div></form></div>';
  document.body.appendChild(modal);
  _a11yModal(modal);
  var errEl = modal.querySelector('#fpErr'), submitBtn = modal.querySelector('#fpSubmit');
  modal.querySelector('#fpForm').addEventListener('submit', async function() {
    var title = modal.querySelector('#fpTitle').value.trim();
    var body = modal.querySelector('#fpBody').value;
    errEl.style.display = 'none';
    if (!title) { errEl.textContent = 'Post title is required'; errEl.style.display = 'block'; return; }
    submitBtn.disabled = true; submitBtn.textContent = 'Posting...';
    try { await window.threadManager.newForumPost(title, body); modal.remove(); }
    catch (e) { errEl.textContent = e.message || 'Failed'; errEl.style.display = 'block'; submitBtn.disabled = false; submitBtn.textContent = 'Post'; }
  });
  modal.querySelector('#fpCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

channelManager.showCreateCategoryModal = function() {
  document.getElementById('categoryCreateModal')?.remove();
  var modal = document.createElement('div');
  modal.id = 'categoryCreateModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box" style="max-width:360px"><div class="modal-title">Create Category</div>' +
    '<div class="modal-error" id="catErr" style="display:none"></div><form id="catForm" onsubmit="return false">' +
    '<div class="modal-field"><label class="modal-label">Category Name</label><input type="text" class="modal-input" id="catName" placeholder="Category Name" maxlength="50" autofocus></div>' +
    '<div class="modal-actions"><button type="button" class="modal-btn secondary" id="catCancel">Cancel</button><button type="submit" class="modal-btn" id="catSubmit">Create Category</button></div></form></div>';
  document.body.appendChild(modal);
  _a11yModal(modal);
  var errEl = modal.querySelector('#catErr'), submitBtn = modal.querySelector('#catSubmit');
  modal.querySelector('#catForm').addEventListener('submit', async function() {
    var name = modal.querySelector('#catName').value.trim();
    errEl.style.display = 'none';
    if (!name) { errEl.textContent = 'Category name is required'; errEl.style.display = 'block'; return; }
    submitBtn.disabled = true; submitBtn.textContent = 'Creating...';
    try { await channelManager.createCategory(name); modal.remove(); }
    catch (e) { errEl.textContent = e.message || 'Failed'; errEl.style.display = 'block'; submitBtn.disabled = false; submitBtn.textContent = 'Create Category'; }
  });
  modal.querySelector('#catCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

channelManager.showRenameCategoryModal = function(categoryId, currentName) {
  document.getElementById('categoryRenameModal')?.remove();
  var modal = document.createElement('div');
  modal.id = 'categoryRenameModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box" style="max-width:360px"><div class="modal-title">Rename Category</div>' +
    '<form id="carForm" onsubmit="return false"><div class="modal-field"><label class="modal-label">Category Name</label>' +
    '<input type="text" class="modal-input" id="carName" value="' + escHtml(currentName) + '" maxlength="50" autofocus></div>' +
    '<div class="modal-actions"><button type="button" class="modal-btn secondary" id="carCancel">Cancel</button><button type="submit" class="modal-btn">Save</button></div></form></div>';
  document.body.appendChild(modal);
  _a11yModal(modal);
  var input = modal.querySelector('#carName'); input.focus(); input.select();
  modal.querySelector('#carForm').addEventListener('submit', async function() {
    var name = input.value.trim();
    if (!name || name === currentName) { modal.remove(); return; }
    try { await channelManager.renameCategory(categoryId, name); modal.remove(); } catch (e) { window.ui && window.ui.showToast && window.ui.showToast('Rename failed: ' + (e && e.message || 'unknown'), 3000, 'error'); }
  });
  modal.querySelector('#carCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

channelManager.showDeleteCategoryConfirm = function(categoryId) {
  var cat = (state.categories || []).find(function(c) { return c.id === categoryId; });
  if (!cat) return;
  ui.confirm({ title: 'Delete category "' + cat.name + '"?', message: 'Its channels will move to Uncategorized.', confirmLabel: 'Delete', danger: true }).then(function(yes) {
    if (yes) channelManager.deleteCategory(categoryId).catch(function(e) { if (window.ui && ui.showToast) ui.showToast(e && e.message || 'Delete failed', 3000, 'error'); });
  });
};

channelManager.showCategoryContextMenu = function(categoryId, x, y) {
  channelManager.hideContextMenu();
  var cat = (state.categories || []).find(function(c) { return c.id === categoryId; });
  if (!cat) return;
  var isOwnerCat = window.serverRoles && state.currentServerId &&
    (serverRoles.isOwner(state.currentServerId) || serverRoles.isAdmin(state.currentServerId));
  if (!isOwnerCat) return;
  _mkMenu('categoryContextMenu', x, y,
    '<div class="context-menu-item" data-action="create-channel">Create Channel</div><div class="context-menu-item" data-action="rename">Rename Category</div><div class="context-menu-item danger" data-action="delete">Delete Category</div>',
    function(action) {
      channelManager.hideContextMenu();
      if (action === 'create-channel') channelManager.showCreateModal(null, categoryId);
      else if (action === 'rename') channelManager.showRenameCategoryModal(categoryId, cat.name);
      else if (action === 'delete') channelManager.showDeleteCategoryConfirm(categoryId);
    });
};

channelManager.showContextMenu = function(channelId, x, y) {
  channelManager.hideContextMenu();
  var ch = (state.channels || []).find(function(c) { return c.id === channelId; });
  if (!ch) return;
  var isOwner = window.serverRoles && state.currentServerId &&
    (serverRoles.isOwner(state.currentServerId) || serverRoles.isAdmin(state.currentServerId));
  var items = '<div class="context-menu-item" data-action="settings">Channel Settings…</div>';
  if (isOwner) {
    items += '<div class="context-menu-item" data-action="rename">Rename</div>'
      + '<div class="context-menu-item danger" data-action="delete">Delete Channel</div>';
  }
  _mkMenu('channelContextMenu', x, y, items,
    function(action) {
      channelManager.hideContextMenu();
      if (action === 'rename') channelManager.showRenameModal(channelId, ch.name);
      else if (action === 'delete') channelManager.showDeleteConfirm(channelId);
      else if (action === 'settings') channelManager.showSettingsModal(channelId);
    });
};

channelManager.showSettingsModal = function(channelId) {
  var ch = (state.channels || []).find(function(c) { return c.id === channelId; });
  if (!ch) return;
  document.getElementById('channelSettingsModal')?.remove();

  var isOwner = window.serverRoles && state.currentServerId &&
    (serverRoles.isOwner(state.currentServerId) || serverRoles.isAdmin(state.currentServerId));
  var typeNames = { text: 'Text', voice: 'Voice', announcement: 'Announcement', threaded: 'Threaded', forum: 'Forum' };
  var typeLabel = Object.prototype.hasOwnProperty.call(typeNames, ch.type) ? typeNames[ch.type] : escHtml(ch.type);
  var modeNow = ch.voiceMode || 'ptt';
  var topicNow = ch.topic || '';

  var voiceSection = '';
  if (ch.type === 'voice') {
    voiceSection =
      '<div class="modal-field"><label class="modal-label">Channel Mode</label>' +
        '<div style="display:flex;gap:8px">' +
          '<label style="flex:1;display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:6px;cursor:' + (isOwner ? 'pointer' : 'not-allowed') + ';background:' + (modeNow === 'ptt' ? 'var(--bg-4)' : 'var(--bg-3)') + ';opacity:' + (isOwner ? '1' : '0.7') + '">' +
            '<input type="radio" name="csMode" value="ptt"' + (modeNow === 'ptt' ? ' checked' : '') + (isOwner ? '' : ' disabled') + ' style="accent-color:var(--accent)">' +
            '<span><strong style="color:var(--fg)">Push-to-talk</strong><br><span style="font-size:11px;color:var(--fg-3)">Hold to speak. Anti-overtalk queues you if someone else is talking.</span></span>' +
          '</label>' +
          '<label style="flex:1;display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:6px;cursor:' + (isOwner ? 'pointer' : 'not-allowed') + ';background:' + (modeNow === 'realtime' ? 'var(--bg-4)' : 'var(--bg-3)') + ';opacity:' + (isOwner ? '1' : '0.7') + '">' +
            '<input type="radio" name="csMode" value="realtime"' + (modeNow === 'realtime' ? ' checked' : '') + (isOwner ? '' : ' disabled') + ' style="accent-color:var(--accent)">' +
            '<span><strong style="color:var(--fg)">Realtime</strong><br><span style="font-size:11px;color:var(--fg-3)">Mic always open. Toggle with the mic button.</span></span>' +
          '</label>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--fg-3);margin-top:6px">Applies to every participant in this channel.' + (isOwner ? '' : ' Only the server owner can change this.') + '</div>' +
      '</div>';
  }

  var modal = document.createElement('div');
  modal.id = 'channelSettingsModal';
  modal.className = 'modal-overlay open';
  modal.innerHTML =
    '<div class="modal-box" style="max-width:460px">' +
      '<div class="modal-title">' + typeLabel + ' Channel Settings</div>' +
      '<div class="modal-subtitle">#' + escHtml(ch.name || '') + '</div>' +
      '<div class="modal-field"><label class="modal-label">Name</label>' +
        '<input type="text" class="modal-input" id="csName" value="' + escHtml(ch.name || '') + '" maxlength="40"' + (isOwner ? '' : ' disabled') + '></div>' +
      '<div class="modal-field"><label class="modal-label">Topic</label>' +
        '<input type="text" class="modal-input" id="csTopic" value="' + escHtml(topicNow) + '" maxlength="200" placeholder="What is this channel about?"' + (isOwner ? '' : ' disabled') + '></div>' +
      voiceSection +
      (isOwner
        ? '<div class="modal-actions"><button type="button" class="modal-btn secondary" id="csCancel">Cancel</button><button type="button" class="modal-btn" id="csSave">Save</button></div>'
        : '<button type="button" class="modal-btn secondary" id="csCancel">Close</button>') +
    '</div>';
  document.body.appendChild(modal);
  _a11yModal(modal);

  if (isOwner) {
    modal.querySelector('#csSave').addEventListener('click', async function() {
      var patch = {};
      var newName = (modal.querySelector('#csName').value || '').trim();
      var newTopic = (modal.querySelector('#csTopic').value || '').trim();
      if (newName && newName !== ch.name) patch.name = newName;
      if (newTopic !== topicNow) patch.topic = newTopic;
      if (ch.type === 'voice') {
        var modeEl = modal.querySelector('input[name="csMode"]:checked');
        if (modeEl && modeEl.value !== modeNow) patch.voiceMode = modeEl.value;
      }
      if (!Object.keys(patch).length) { modal.remove(); return; }
      try {
        await channelManager.update(channelId, patch);
        if (window.ui?.showToast) ui.showToast('Channel settings saved');
        modal.remove();
      } catch (e) {
        if (window.ui?.showToast) ui.showToast('Failed to save channel settings: ' + (e && e.message || 'unknown error'), 'error');
        console.warn('[Channel] update failed:', e && e.message);
      }
    });
  }
  modal.querySelector('#csCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

channelManager.showProfileModal = function() {
  document.getElementById('profileModal')?.remove();
  var resolved = (window.chat && window.chat.resolveProfile(window.state.nostrPubkey)) || '';
  var cur = /^npub1/.test(resolved) ? '' : resolved;
  var modal = document.createElement('div');
  modal.id = 'profileModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box"><div class="modal-title">Display name</div>' +
    '<div class="modal-subtitle">Shown to everyone instead of your key. Published to relays.</div>' +
    '<form id="profileForm" onsubmit="return false">' +
    '<div class="modal-field"><label class="modal-label" for="profileName">Name</label>' +
    '<input type="text" class="modal-input" id="profileName" maxlength="40" autocomplete="off" value="' + escHtml(cur) + '" autofocus></div>' +
    '<div class="modal-actions"><button type="button" class="modal-btn secondary" id="profileCancel">Cancel</button><button type="submit" class="modal-btn" id="profileSave">Save</button></div>' +
    '</form></div>';
  document.body.appendChild(modal);
  _a11yModal(modal);
  var input = modal.querySelector('#profileName');
  modal.querySelector('#profileCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  modal.querySelector('#profileForm').addEventListener('submit', async function() {
    var name = input.value.trim();
    if (!name) { _invalidInput(input); return; }
    try { await window.auth.setDisplayName(name.slice(0, 40)); modal.remove(); window.ui && window.ui.showToast && window.ui.showToast('Display name saved', 2500); }
    catch (e) { window.ui && window.ui.showToast && window.ui.showToast('Could not save name: ' + (e && e.message || 'unknown'), 4000, 'error'); }
  });
};

channelManager.showNewDmModal = function() {
  document.getElementById('newDmModal')?.remove();
  var modal = document.createElement('div');
  modal.id = 'newDmModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box"><div class="modal-title">New message</div>' +
    '<div class="modal-subtitle">Messages are end-to-end encrypted between you and them.</div>' +
    '<form id="newDmForm" onsubmit="return false">' +
    '<div class="modal-field"><label class="modal-label" for="newDmPeer">Their public key (npub)</label>' +
    '<input type="text" class="modal-input" id="newDmPeer" placeholder="npub1..." autocomplete="off" spellcheck="false" autofocus>' +
    '<div id="newDmOwnNpub" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--fg-3)"></div></div>' +
    '<div class="modal-actions"><button type="button" class="modal-btn secondary" id="newDmCancel">Cancel</button><button type="submit" class="modal-btn">Start</button></div>' +
    '</form></div>';
  document.body.appendChild(modal);
  _a11yModal(modal);
  var input = modal.querySelector('#newDmPeer');
  var ownNpub = '';
  try { ownNpub = (window.state && window.state.nostrPubkey && window.NostrTools) ? window.NostrTools.nip19.npubEncode(window.state.nostrPubkey) : ''; } catch (e) { ownNpub = ''; }
  var hint = modal.querySelector('#newDmOwnNpub');
  if (hint && ownNpub) {
    var hintText = document.createElement('span');
    hintText.textContent = 'Ask them for theirs — yours is ' + ownNpub.slice(0, 12) + '…';
    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'modal-btn secondary';
    copyBtn.style.cssText = 'padding:2px 8px;min-height:0;font-size:11px';
    copyBtn.textContent = 'click to copy';
    copyBtn.addEventListener('click', function() {
      navigator.clipboard?.writeText(ownNpub).then(function() {
        copyBtn.textContent = 'copied!';
        setTimeout(function() { copyBtn.textContent = 'click to copy'; }, 1600);
      }).catch(function(e) {
        window.ui && window.ui.showToast && window.ui.showToast('Clipboard copy failed: ' + (e && e.message || 'select the key and copy manually'), 4000, 'error');
      });
    });
    hint.append(hintText, copyBtn);
  }
  modal.querySelector('#newDmCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  modal.querySelector('#newDmForm').addEventListener('submit', function() {
    var raw = input.value.trim(), hex = null;
    try {
      if (/^[0-9a-f]{64}$/i.test(raw)) hex = raw.toLowerCase();
      else { var d = window.NostrTools.nip19.decode(raw); if (d.type === 'npub') hex = d.data; else if (d.type === 'nprofile') hex = d.data.pubkey; }
    } catch (e) { hex = null; }
    if (!hex) { _invalidInput(input); window.ui && window.ui.showToast && window.ui.showToast('That is not a valid npub or public key', 3000, 'error'); return; }
    window.stateSignals.activeDmPeer.value = hex;
    modal.remove();
  });
};

channelManager.showKeyBackupModal = function() {
  document.getElementById('keyBackupModal')?.remove();
  var nsec = window.auth && window.auth.nsecEncode && window.auth.nsecEncode();
  if (!nsec) return;
  var modal = document.createElement('div');
  modal.id = 'keyBackupModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box" style="max-width:440px"><div class="modal-title">Back Up Your Key</div>' +
    '<p style="font-size:13px;color:var(--fg-3);margin:0 0 12px 0">This is your private key. Anyone with it can post as you, forever. Store it somewhere safe (a password manager) and never share it.</p>' +
    '<div class="modal-field"><button type="button" class="modal-btn" id="kbReveal">Click to reveal</button>' +
    '<textarea class="modal-input" id="kbNsec" readonly rows="3" style="display:none;font-family:var(--ff-mono,monospace);font-size:12px;word-break:break-all;margin-top:8px"></textarea></div>' +
    '<div class="modal-actions"><button type="button" class="modal-btn secondary" id="kbClose">Done</button><button type="button" class="modal-btn" id="kbCopy" style="display:none">Copy to clipboard</button></div></div>';
  document.body.appendChild(modal);
  _a11yModal(modal);
  var revealBtn = modal.querySelector('#kbReveal'), ta = modal.querySelector('#kbNsec'), copyBtn = modal.querySelector('#kbCopy');
  revealBtn.addEventListener('click', function() {
    ta.value = nsec; ta.style.display = 'block'; copyBtn.style.display = 'inline-block'; revealBtn.style.display = 'none';
  });
  copyBtn.addEventListener('click', function() {
    navigator.clipboard?.writeText(nsec).then(function() {
      copyBtn.textContent = 'Copied!'; setTimeout(function() { copyBtn.textContent = 'Copy to clipboard'; }, 1600);
    }).catch(function(e) {
      window.ui && window.ui.showToast && window.ui.showToast('Clipboard copy failed: ' + (e && e.message || 'select the text and copy manually'), 4000, 'error');
    });
  });
  modal.querySelector('#kbClose').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};
