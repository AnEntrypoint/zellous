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
    try { await window.__zellous.threads.newForumPost(title, body); modal.remove(); }
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

