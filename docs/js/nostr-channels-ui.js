var _mkMenu = function(id, x, y, html, onAction) {
  document.getElementById(id)?.remove();
  var menu = document.createElement('div');
  menu.id = id; menu.className = 'context-menu';
  menu.style.cssText = 'position:fixed;top:' + y + 'px;left:' + x + 'px;z-index:2500';
  menu.innerHTML = html;
  document.body.appendChild(menu);
  var r = menu.getBoundingClientRect();
  if (r.right > window.innerWidth) menu.style.left = (window.innerWidth - r.width - 8) + 'px';
  if (r.bottom > window.innerHeight) menu.style.top = (window.innerHeight - r.height - 8) + 'px';
  menu.addEventListener('click', function(e) { onAction(e.target.dataset.action, menu); });
  var close = function(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
  setTimeout(function() { document.addEventListener('click', close); }, 0);
};

channelManager.showCreateModal = function(type, categoryId) {
  document.getElementById('channelCreateModal')?.remove();
  var cats = state.categories || [];
  var catOpts = cats.map(function(c) { return '<option value="' + c.id + '"' + (c.id === categoryId ? ' selected' : '') + '>' + c.name + '</option>'; }).join('');
  var modal = document.createElement('div');
  modal.id = 'channelCreateModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box" style="max-width:400px"><div class="modal-title">Create Channel</div>' +
    '<div class="modal-error" id="ccErr" style="display:none"></div><form id="ccForm" onsubmit="return false">' +
    '<div class="modal-field"><label class="modal-label">Channel Type</label><select class="modal-input" id="ccType"><option value="text">Text</option><option value="voice">Voice</option><option value="threaded">Threaded</option></select></div>' +
    '<div class="modal-field"><label class="modal-label">Channel Name</label><input type="text" class="modal-input" id="ccName" placeholder="new-channel" maxlength="40" autofocus></div>' +
    '<div class="modal-field"><label class="modal-label">Category</label><select class="modal-input" id="ccCat"><option value="">No Category</option>' + catOpts + '</select></div>' +
    '<button type="submit" class="modal-btn" id="ccSubmit">Create Channel</button><button type="button" class="modal-btn secondary" id="ccCancel">Cancel</button></form></div>';
  document.body.appendChild(modal);
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
    '<input type="text" class="modal-input" id="crName" value="' + currentName + '" maxlength="40" autofocus></div>' +
    '<button type="submit" class="modal-btn">Save</button><button type="button" class="modal-btn secondary" id="crCancel">Cancel</button></form></div>';
  document.body.appendChild(modal);
  var input = modal.querySelector('#crName'); input.focus(); input.select();
  modal.querySelector('#crForm').addEventListener('submit', async function() {
    var name = input.value.trim();
    if (!name || name === currentName) { modal.remove(); return; }
    try { await channelManager.rename(channelId, name); modal.remove(); } catch (e) { console.warn('[Channel] Rename failed:', e.message); }
  });
  modal.querySelector('#crCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

channelManager.showDeleteConfirm = function(channelId) {
  var ch = (state.channels || []).find(function(c) { return c.id === channelId; });
  if (ch && confirm('Delete #' + ch.name + '?')) channelManager.remove(channelId).catch(console.warn);
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
    '<input type="text" class="modal-input" id="carName" value="' + currentName + '" maxlength="50" autofocus></div>' +
    '<button type="submit" class="modal-btn">Save</button><button type="button" class="modal-btn secondary" id="carCancel">Cancel</button></form></div>';
  document.body.appendChild(modal);
  var input = modal.querySelector('#carName'); input.focus(); input.select();
  modal.querySelector('#carForm').addEventListener('submit', async function() {
    var name = input.value.trim();
    if (!name || name === currentName) { modal.remove(); return; }
    try { await channelManager.renameCategory(categoryId, name); modal.remove(); } catch (e) { console.warn('[Category] Rename failed:', e.message); }
  });
  modal.querySelector('#carCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

channelManager.showDeleteCategoryConfirm = function(categoryId) {
  var cat = (state.categories || []).find(function(c) { return c.id === categoryId; });
  if (cat && confirm('Delete category "' + cat.name + '"? Channels will be moved to Uncategorized.')) channelManager.deleteCategory(categoryId).catch(console.warn);
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
  _mkMenu('channelContextMenu', x, y,
    '<div class="context-menu-item" data-action="rename">Rename</div><div class="context-menu-item danger" data-action="delete">Delete Channel</div>',
    function(action) {
      channelManager.hideContextMenu();
      if (action === 'rename') channelManager.showRenameModal(channelId, ch.name);
      else if (action === 'delete') channelManager.showDeleteConfirm(channelId);
    });
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
          if (tch) { var nc = tch.categoryId, chs2 = channels.filter(function(c) { return c.categoryId === nc; }).sort(function(a, b) { return (a.position||0)-(b.position||0); }); var ti = chs2.findIndex(function(c) { return c.id === dropT.id; }), np = dropT.position === 'before' ? ti : ti+1, ids = chs2.map(function(c) { return c.id; }), fi = ids.indexOf(dCh); if (fi !== -1) ids.splice(fi, 1); ids.splice(np > fi ? np-1 : np, 0, dCh); try { await channelManager.reorderChannels(nc, ids); } catch(err) { console.warn(err.message); } }
        } else if (dropT.type === 'category') { var nc2 = dropT.id === 'uncategorized' ? null : dropT.id, chs3 = channels.filter(function(c) { return c.categoryId === nc2; }).sort(function(a,b){return(a.position||0)-(b.position||0);}), ids2 = chs3.map(function(c){return c.id;}); if (dropT.position === 'first') ids2.unshift(dCh); else ids2.push(dCh); try { await channelManager.reorderChannels(nc2, ids2); } catch(err) { console.warn(err.message); } }
      }
    } else if (dCat && dropT) {
      var cats = state.categories || [], sorted = cats.slice().sort(function(a,b){return(a.position||0)-(b.position||0);}); var di = sorted.findIndex(function(c){return c.id===dCat;}), ti2 = sorted.findIndex(function(c){return c.id===dropT.id;});
      if (di !== -1 && ti2 !== -1) { var rem = sorted.splice(di,1)[0]; sorted.splice(dropT.position==='before'?ti2:ti2+1, 0, rem); try { await channelManager.reorderCategories(sorted.map(function(c){return c.id;})); } catch(err) { console.warn(err.message); } }
    }
  });
};
