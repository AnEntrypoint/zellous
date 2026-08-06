// Shared accessibility wiring for zellous's own hand-rolled `.modal-overlay`
// dialogs (Create Channel, Rename, Create Page, etc.) -- none of them had a
// focus trap, an Escape-to-close, or dialog semantics, unlike every SDK-owned
// overlay (SettingsPopover/EmojiPicker/etc, see anentrypoint-design's
// _anchoredOverlayLifecycle). Attach once, right after the modal is appended
// to the DOM: traps Tab/Shift+Tab inside the modal box, closes on Escape,
// and focuses the first focusable field so keyboard users land inside it
// immediately instead of needing to Tab in from wherever focus was before.
function _a11yModal(modal) {
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
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

// Shared empty/invalid-field feedback for creation/rename forms: a brief
// shake + red border so a blocked submit (e.g. empty name) is visible
// instead of the button silently doing nothing.
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
  var menu = document.createElement('div');
  menu.id = id; menu.className = 'context-menu open';
  menu.style.cssText = 'position:fixed;top:' + y + 'px;left:' + x + 'px;z-index:2500';
  menu.innerHTML = html;
  document.body.appendChild(menu);
  var r = menu.getBoundingClientRect();
  if (r.right > window.innerWidth) menu.style.left = (window.innerWidth - r.width - 8) + 'px';
  if (r.bottom > window.innerHeight) menu.style.top = (window.innerHeight - r.height - 8) + 'px';
  var items = menu.querySelectorAll('.context-menu-item');
  items.forEach(function(it) { it.setAttribute('tabindex', '0'); it.setAttribute('role', 'menuitem'); });
  menu.addEventListener('click', function(e) { onAction(e.target.dataset.action, menu); });
  menu.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target.classList && e.target.classList.contains('context-menu-item')) {
        e.preventDefault();
        onAction(e.target.dataset.action, menu);
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
  var closeMenu = function() { menu.remove(); document.removeEventListener('click', close); document.removeEventListener('keydown', onDocKeydown); };
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
    '<button type="submit" class="modal-btn" id="ccSubmit">Create Channel</button><button type="button" class="modal-btn secondary" id="ccCancel">Cancel</button></form></div>';
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
    '<button type="submit" class="modal-btn">Save</button><button type="button" class="modal-btn secondary" id="crCancel">Cancel</button></form></div>';
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
  if (ch && confirm('Delete #' + ch.name + '?')) channelManager.remove(channelId).catch(function(e) { if (window.ui && ui.showToast) ui.showToast(e && e.message || 'Delete failed', 3000, 'error'); });
};

channelManager.showNewForumPostModal = function() {
  document.getElementById('forumPostModal')?.remove();
  var modal = document.createElement('div');
  modal.id = 'forumPostModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box" style="max-width:480px"><div class="modal-title">New Forum Post</div>' +
    '<div class="modal-error" id="fpErr" style="display:none"></div><form id="fpForm" onsubmit="return false">' +
    '<div class="modal-field"><label class="modal-label">Title</label><input type="text" class="modal-input" id="fpTitle" placeholder="Post title" maxlength="120" autofocus></div>' +
    '<div class="modal-field"><label class="modal-label">Body</label><textarea class="modal-input" id="fpBody" rows="8" style="resize:vertical" placeholder="Write your post..."></textarea></div>' +
    '<button type="submit" class="modal-btn" id="fpSubmit">Post</button><button type="button" class="modal-btn secondary" id="fpCancel">Cancel</button></form></div>';
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
    '<button type="submit" class="modal-btn" id="catSubmit">Create Category</button><button type="button" class="modal-btn secondary" id="catCancel">Cancel</button></form></div>';
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
    '<button type="submit" class="modal-btn">Save</button><button type="button" class="modal-btn secondary" id="carCancel">Cancel</button></form></div>';
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
  if (cat && confirm('Delete category "' + cat.name + '"? Channels will be moved to Uncategorized.')) channelManager.deleteCategory(categoryId).catch(function(e) { if (window.ui && ui.showToast) ui.showToast(e && e.message || 'Delete failed', 3000, 'error'); });
};

channelManager.showCategoryContextMenu = function(categoryId, x, y) {
  channelManager.hideContextMenu();
  var cat = (state.categories || []).find(function(c) { return c.id === categoryId; });
  if (!cat) return;
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
  var items = ''
    + '<div class="context-menu-item" data-action="settings">Channel Settings…</div>'
    + '<div class="context-menu-item" data-action="rename">Rename</div>'
    + '<div class="context-menu-item danger" data-action="delete">Delete Channel</div>';
  _mkMenu('channelContextMenu', x, y, items,
    function(action) {
      channelManager.hideContextMenu();
      if (action === 'rename') channelManager.showRenameModal(channelId, ch.name);
      else if (action === 'delete') channelManager.showDeleteConfirm(channelId);
      else if (action === 'settings') channelManager.showSettingsModal(channelId);
    });
};

// Unified channel-settings modal. Works for any channel type. Voice channels
// get an extra Mode (PTT/Realtime) section. The mode lives on the channel
// metadata so all participants see the same setting — it is not a per-user
// preference. Only the server owner can save; others see read-only.
channelManager.showSettingsModal = function(channelId) {
  var ch = (state.channels || []).find(function(c) { return c.id === channelId; });
  if (!ch) return;
  document.getElementById('channelSettingsModal')?.remove();

  var isOwner = window.serverRoles && state.currentServerId &&
    (serverRoles.isOwner(state.currentServerId) || serverRoles.isAdmin(state.currentServerId));
  var typeLabel = { text: 'Text', voice: 'Voice', announcement: 'Announcement', threaded: 'Threaded', forum: 'Forum' }[ch.type] || escHtml(ch.type);
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
        ? '<button type="button" class="modal-btn" id="csSave">Save</button><button type="button" class="modal-btn secondary" id="csCancel">Cancel</button>'
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
      } catch (e) { console.warn('[Channel] update failed:', e.message); }
    });
  }
  modal.querySelector('#csCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

channelManager.initDragAndDrop = function() {
  var cl = document.getElementById('channelList');
  if (!cl) return;
  var dCh = null, dCat = null, dropT = null, ind = null;
  var mkInd = function(h) { var el = document.createElement('div'); el.style.cssText = 'height:' + (h||2) + 'px;background:var(--brand);margin:' + (h > 2 ? '4' : '2') + 'px 0;border-radius:1px;'; return el; };
  var pos = function(e, el) { var r = el.getBoundingClientRect(); return e.clientY < (r.top + r.height / 2) ? 'before' : 'after'; };
  cl.addEventListener('dragstart', function(e) {
    var ci = e.target.closest('.channel-item'), ch = e.target.closest('.category-header');
    if (ci) { dCh = ci.dataset.channel; e.dataTransfer.effectAllowed = 'move'; ci.style.opacity = '0.5'; }
    else if (ch && ch.dataset.category !== 'uncategorized') { dCat = ch.dataset.category; e.dataTransfer.effectAllowed = 'move'; ch.style.opacity = '0.5'; }
  });
  cl.addEventListener('dragend', function(e) {
    var ci = e.target.closest('.channel-item'), ch = e.target.closest('.category-header');
    if (ci) ci.style.opacity = '1'; if (ch) ch.style.opacity = '1';
    if (ind) { ind.remove(); ind = null; } dCh = null; dCat = null; dropT = null;
  });
  cl.addEventListener('dragover', function(e) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    if (ind) ind.remove();
    if (dCh) {
      ind = mkInd(2); var tc = e.target.closest('.channel-item'), th = e.target.closest('.category-header');
      if (tc && tc.dataset.channel !== dCh) { var p = pos(e, tc); if (p === 'before') tc.parentNode.insertBefore(ind, tc); else tc.parentNode.insertBefore(ind, tc.nextSibling); dropT = { type: 'channel', id: tc.dataset.channel, position: p }; }
      else if (th) { var cid = th.dataset.category, chs = (state.channels || []).filter(function(c) { return c.categoryId === cid; }); if (!chs.length) { th.parentNode.insertBefore(ind, th.nextSibling); dropT = { type: 'category', id: cid, position: 'after' }; } else { var fc = cl.querySelector('.channel-item[data-channel="' + chs[0].id + '"]'); if (fc) { th.parentNode.insertBefore(ind, fc); dropT = { type: 'category', id: cid, position: 'first' }; } } }
    } else if (dCat) {
      ind = mkInd(4); var th2 = e.target.closest('.category-header');
      if (th2 && th2.dataset.category !== dCat && th2.dataset.category !== 'uncategorized') {
        var p2 = pos(e, th2);
        if (p2 === 'before') { th2.parentNode.insertBefore(ind, th2); } else { var nx = th2.nextSibling; while (nx && !nx.classList.contains('category-header')) nx = nx.nextSibling; if (nx) th2.parentNode.insertBefore(ind, nx); else th2.parentNode.appendChild(ind); }
        dropT = { type: 'category-reorder', id: th2.dataset.category, position: p2 };
      }
    }
  });
  cl.addEventListener('drop', async function(e) {
    e.preventDefault(); if (ind) { ind.remove(); ind = null; }
    if (dCh && dropT) {
      var channels = state.channels || [], draggedCh = channels.find(function(c) { return c.id === dCh; });
      if (draggedCh) {
        if (dropT.type === 'channel') {
          var tch = channels.find(function(c) { return c.id === dropT.id; });
          if (tch) { var nc = tch.categoryId, chs2 = channels.filter(function(c) { return c.categoryId === nc; }).sort(function(a, b) { return (a.position||0)-(b.position||0); }); var ti = chs2.findIndex(function(c) { return c.id === dropT.id; }), np = dropT.position === 'before' ? ti : ti+1, ids = chs2.map(function(c) { return c.id; }), fi = ids.indexOf(dCh); if (fi !== -1) ids.splice(fi, 1); ids.splice(np > fi ? np-1 : np, 0, dCh); try { await channelManager.reorderChannels(nc, ids); } catch(err) { window.ui && window.ui.showToast && window.ui.showToast('Reorder failed: ' + (err && err.message || 'unknown'), 3000, 'error'); } }
        } else if (dropT.type === 'category') { var nc2 = dropT.id === 'uncategorized' ? null : dropT.id, chs3 = channels.filter(function(c) { return c.categoryId === nc2; }).sort(function(a,b){return(a.position||0)-(b.position||0);}), ids2 = chs3.map(function(c){return c.id;}); if (dropT.position === 'first') ids2.unshift(dCh); else ids2.push(dCh); try { await channelManager.reorderChannels(nc2, ids2); } catch(err) { window.ui && window.ui.showToast && window.ui.showToast('Reorder failed: ' + (err && err.message || 'unknown'), 3000, 'error'); } }
      }
    } else if (dCat && dropT) {
      var cats = state.categories || [], sorted = cats.slice().sort(function(a,b){return(a.position||0)-(b.position||0);}); var di = sorted.findIndex(function(c){return c.id===dCat;}), ti2 = sorted.findIndex(function(c){return c.id===dropT.id;});
      if (di !== -1 && ti2 !== -1) { var rem = sorted.splice(di,1)[0]; sorted.splice(dropT.position==='before'?ti2:ti2+1, 0, rem); try { await channelManager.reorderCategories(sorted.map(function(c){return c.id;})); } catch(err) { window.ui && window.ui.showToast && window.ui.showToast('Reorder failed: ' + (err && err.message || 'unknown'), 3000, 'error'); } }
    }
  });
};

// The private key IS the identity here (no backend, no account, no
// password reset) -- this is the one recovery path a static client can
// offer: show the real nsec so the user can copy it somewhere safe BEFORE
// clearing site data or switching devices makes the identity permanently
// unrecoverable. Deliberately requires an explicit "reveal" click rather
// than rendering the secret key directly in the DOM on modal open, so a
// screen-recording or shoulder-surf doesn't capture it by just opening
// Settings.
channelManager.showKeyBackupModal = function() {
  document.getElementById('keyBackupModal')?.remove();
  var nsec = window.auth && window.auth.nsecEncode && window.auth.nsecEncode();
  if (!nsec) return;
  var modal = document.createElement('div');
  modal.id = 'keyBackupModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box" style="max-width:440px"><div class="modal-title">Back Up Your Key</div>' +
    '<p style="font-size:13px;color:var(--text-faint);margin:0 0 12px 0">This is your private key. Anyone with it can post as you, forever. Store it somewhere safe (a password manager) and never share it.</p>' +
    '<div class="modal-field"><button type="button" class="modal-btn" id="kbReveal">Click to reveal</button>' +
    '<textarea class="modal-input" id="kbNsec" readonly rows="3" style="display:none;font-family:var(--ff-mono,monospace);font-size:12px;word-break:break-all;margin-top:8px"></textarea></div>' +
    '<button type="button" class="modal-btn" id="kbCopy" style="display:none">Copy to clipboard</button>' +
    '<button type="button" class="modal-btn secondary" id="kbClose">Done</button></div>';
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
