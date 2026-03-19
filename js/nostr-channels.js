var DEFAULT_CATEGORIES = [
  { id: 'general', name: 'TEXT CHANNELS', position: 0 },
  { id: 'voice', name: 'VOICE CHANNELS', position: 1 }
];

var DEFAULT_CHANNELS = [
  { id: 'general', name: 'general', type: 'text', categoryId: 'general', position: 0 },
  { id: 'announcements', name: 'announcements', type: 'announcement', categoryId: 'general', position: 1 },
  { id: 'general-voice', name: 'General', type: 'voice', categoryId: 'voice', position: 0 }
];

async function _hexChannelId(channelId, serverId) {
  var input = (serverId || '') + ':' + channelId;
  var buf = new TextEncoder().encode(input);
  var hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

var channelManager = {
  isOwner: function() {
    return state.nostrPubkey && state.currentServerId && state.nostrPubkey === state.currentServerId.split(':')[0];
  },

  loadChannels: function(serverId, onReady) {
    var parts = serverId.split(':');
    var ownerPubkey = parts[0];
    var dTag = 'zellous-channels:' + serverId;
    nostrNet.subscribe(
      'channels-' + serverId,
      [{ kinds: [30078], authors: [ownerPubkey], '#d': [dTag] }],
      function(event) {
        try {
          var data = JSON.parse(event.content);
          state.channels = data.channels || [];
          state.categories = data.categories || [];
          ui.render.all();
        } catch (e) { console.warn('[nostr-channels] parse error:', e.message); }
      },
      function() {
        if (!state.channels.length) channelManager._setDefaults();
        if (onReady) onReady();
      }
    );
  },

  _setDefaults: function() {
    state.channels = DEFAULT_CHANNELS.map(function(c) { return Object.assign({}, c); });
    state.categories = DEFAULT_CATEGORIES.map(function(c) { return Object.assign({}, c); });
    ui.render.all();
  },

  _publishChannelList: async function() {
    if (!channelManager.isOwner()) return;
    var serverId = state.currentServerId;
    var template = {
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', 'zellous-channels:' + serverId]],
      content: JSON.stringify({ channels: state.channels, categories: state.categories })
    };
    var signed = await auth.sign(template);
    await nostrNet.publish(signed);
  },

  create: async function(name, type, categoryId) {
    var id = 'ch-' + Date.now();
    state.channels = state.channels.concat([{
      id: id,
      name: name,
      type: type || 'text',
      categoryId: categoryId || 'general',
      position: state.channels.length
    }]);
    await channelManager._publishChannelList();
    ui.render.all();
  },

  rename: async function(id, name) {
    state.channels = state.channels.map(function(c) {
      return c.id === id ? Object.assign({}, c, { name: name }) : c;
    });
    await channelManager._publishChannelList();
    ui.render.all();
  },

  remove: async function(id) {
    state.channels = state.channels.filter(function(c) { return c.id !== id; });
    await channelManager._publishChannelList();
    ui.render.all();
  },

  createCategory: async function(name) {
    var id = 'cat-' + Date.now();
    state.categories = state.categories.concat([{ id: id, name: name, position: state.categories.length }]);
    await channelManager._publishChannelList();
    ui.render.all();
  },

  renameCategory: async function(id, name) {
    state.categories = state.categories.map(function(c) {
      return c.id === id ? Object.assign({}, c, { name: name }) : c;
    });
    await channelManager._publishChannelList();
    ui.render.all();
  },

  deleteCategory: async function(id) {
    state.categories = state.categories.filter(function(c) { return c.id !== id; });
    state.channels = state.channels.map(function(c) {
      return c.categoryId === id ? Object.assign({}, c, { categoryId: null }) : c;
    });
    await channelManager._publishChannelList();
    ui.render.all();
  },

  reorderChannels: async function(catId, ids) {
    ids.forEach(function(chId, idx) {
      state.channels = state.channels.map(function(c) {
        return c.id === chId ? Object.assign({}, c, { position: idx, categoryId: catId }) : c;
      });
    });
    await channelManager._publishChannelList();
    ui.render.all();
  },

  reorderCategories: async function(ids) {
    ids.forEach(function(catId, idx) {
      state.categories = state.categories.map(function(c) {
        return c.id === catId ? Object.assign({}, c, { position: idx }) : c;
      });
    });
    await channelManager._publishChannelList();
    ui.render.all();
  },

  showCreateModal: function(type, categoryId) {
    var existing = document.getElementById('channelCreateModal');
    if (existing) existing.remove();
    var cats = state.categories || [];
    var categoryOptions = cats.map(function(c) {
      return '<option value="' + c.id + '"' + (c.id === categoryId ? ' selected' : '') + '>' + c.name + '</option>';
    }).join('');
    var modal = document.createElement('div');
    modal.id = 'channelCreateModal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = '<div class="modal-box" style="max-width:400px">' +
      '<div class="modal-title">Create Channel</div>' +
      '<div class="modal-error" id="channelCreateError" style="display:none"></div>' +
      '<form id="createChannelForm" onsubmit="return false">' +
        '<div class="modal-field"><label class="modal-label">Channel Type</label>' +
          '<select class="modal-input" id="newChannelType">' +
            '<option value="text">Text</option>' +
            '<option value="voice">Voice</option>' +
            '<option value="threaded">Threaded</option>' +
          '</select></div>' +
        '<div class="modal-field"><label class="modal-label">Channel Name</label>' +
          '<input type="text" class="modal-input" id="newChannelName" placeholder="new-channel" maxlength="40" autofocus></div>' +
        '<div class="modal-field"><label class="modal-label">Category</label>' +
          '<select class="modal-input" id="newChannelCategory"><option value="">No Category</option>' + categoryOptions + '</select></div>' +
        '<button type="submit" class="modal-btn" id="createChannelBtn">Create Channel</button>' +
        '<button type="button" class="modal-btn secondary" id="cancelCreateChannel">Cancel</button>' +
      '</form></div>';
    document.body.appendChild(modal);
    var input = modal.querySelector('#newChannelName');
    var typeSelect = modal.querySelector('#newChannelType');
    var catSelect = modal.querySelector('#newChannelCategory');
    var errEl = modal.querySelector('#channelCreateError');
    var submitBtn = modal.querySelector('#createChannelBtn');
    input.focus();
    var showError = function(msg) { errEl.textContent = msg; errEl.style.display = 'block'; };
    modal.querySelector('#createChannelForm').addEventListener('submit', async function() {
      var name = input.value.trim();
      var chType = typeSelect.value;
      var catId = catSelect.value || null;
      errEl.style.display = 'none';
      if (!name) { showError('Channel name is required'); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';
      try {
        await channelManager.create(name, chType, catId);
        modal.remove();
      } catch (e) {
        showError(e.message || 'Failed to create channel');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Channel';
      }
    });
    modal.querySelector('#cancelCreateChannel').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  },

  showRenameModal: function(channelId, currentName) {
    var existing = document.getElementById('channelRenameModal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'channelRenameModal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = '<div class="modal-box" style="max-width:360px">' +
      '<div class="modal-title">Rename Channel</div>' +
      '<form id="renameChannelForm" onsubmit="return false">' +
        '<div class="modal-field"><label class="modal-label">Channel Name</label>' +
          '<input type="text" class="modal-input" id="renameChannelName" value="' + currentName + '" maxlength="40" autofocus></div>' +
        '<button type="submit" class="modal-btn">Save</button>' +
        '<button type="button" class="modal-btn secondary" id="cancelRenameChannel">Cancel</button>' +
      '</form></div>';
    document.body.appendChild(modal);
    var input = modal.querySelector('#renameChannelName');
    input.focus(); input.select();
    modal.querySelector('#renameChannelForm').addEventListener('submit', async function() {
      var name = input.value.trim();
      if (!name || name === currentName) { modal.remove(); return; }
      try { await channelManager.rename(channelId, name); modal.remove(); } catch (e) { console.warn('[Channel] Rename failed:', e.message); }
    });
    modal.querySelector('#cancelRenameChannel').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  },

  showDeleteConfirm: function(channelId) {
    var ch = (state.channels || []).find(function(c) { return c.id === channelId; });
    if (!ch) return;
    if (confirm('Delete #' + ch.name + '?')) {
      channelManager.remove(channelId).catch(function(e) { console.warn('[Channel] Delete failed:', e.message); });
    }
  },

  showCreateCategoryModal: function() {
    var existing = document.getElementById('categoryCreateModal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'categoryCreateModal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = '<div class="modal-box" style="max-width:360px">' +
      '<div class="modal-title">Create Category</div>' +
      '<div class="modal-error" id="categoryCreateError" style="display:none"></div>' +
      '<form id="createCategoryForm" onsubmit="return false">' +
        '<div class="modal-field"><label class="modal-label">Category Name</label>' +
          '<input type="text" class="modal-input" id="newCategoryName" placeholder="Category Name" maxlength="50" autofocus></div>' +
        '<button type="submit" class="modal-btn" id="createCategoryBtn">Create Category</button>' +
        '<button type="button" class="modal-btn secondary" id="cancelCreateCategory">Cancel</button>' +
      '</form></div>';
    document.body.appendChild(modal);
    var input = modal.querySelector('#newCategoryName');
    var errEl = modal.querySelector('#categoryCreateError');
    var submitBtn = modal.querySelector('#createCategoryBtn');
    input.focus();
    var showError = function(msg) { errEl.textContent = msg; errEl.style.display = 'block'; };
    modal.querySelector('#createCategoryForm').addEventListener('submit', async function() {
      var name = input.value.trim();
      errEl.style.display = 'none';
      if (!name) { showError('Category name is required'); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';
      try { await channelManager.createCategory(name); modal.remove(); } catch (e) {
        showError(e.message || 'Failed to create category');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Category';
      }
    });
    modal.querySelector('#cancelCreateCategory').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  },

  showRenameCategoryModal: function(categoryId, currentName) {
    var existing = document.getElementById('categoryRenameModal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'categoryRenameModal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = '<div class="modal-box" style="max-width:360px">' +
      '<div class="modal-title">Rename Category</div>' +
      '<form id="renameCategoryForm" onsubmit="return false">' +
        '<div class="modal-field"><label class="modal-label">Category Name</label>' +
          '<input type="text" class="modal-input" id="renameCategoryName" value="' + currentName + '" maxlength="50" autofocus></div>' +
        '<button type="submit" class="modal-btn">Save</button>' +
        '<button type="button" class="modal-btn secondary" id="cancelRenameCategory">Cancel</button>' +
      '</form></div>';
    document.body.appendChild(modal);
    var input = modal.querySelector('#renameCategoryName');
    input.focus(); input.select();
    modal.querySelector('#renameCategoryForm').addEventListener('submit', async function() {
      var name = input.value.trim();
      if (!name || name === currentName) { modal.remove(); return; }
      try { await channelManager.renameCategory(categoryId, name); modal.remove(); } catch (e) { console.warn('[Category] Rename failed:', e.message); }
    });
    modal.querySelector('#cancelRenameCategory').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  },

  showDeleteCategoryConfirm: function(categoryId) {
    var cat = (state.categories || []).find(function(c) { return c.id === categoryId; });
    if (!cat) return;
    if (confirm('Delete category "' + cat.name + '"? Channels will be moved to Uncategorized.')) {
      channelManager.deleteCategory(categoryId).catch(function(e) { console.warn('[Category] Delete failed:', e.message); });
    }
  },

  showCategoryContextMenu: function(categoryId, x, y) {
    channelManager.hideContextMenu();
    var cat = (state.categories || []).find(function(c) { return c.id === categoryId; });
    if (!cat) return;
    var menu = document.createElement('div');
    menu.id = 'categoryContextMenu';
    menu.className = 'context-menu';
    menu.style.cssText = 'position:fixed;top:' + y + 'px;left:' + x + 'px;z-index:2500';
    menu.innerHTML = '<div class="context-menu-item" data-action="create-channel">Create Channel</div>' +
      '<div class="context-menu-item" data-action="rename">Rename Category</div>' +
      '<div class="context-menu-item danger" data-action="delete">Delete Category</div>';
    document.body.appendChild(menu);
    var rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
    menu.addEventListener('click', async function(e) {
      var action = e.target.dataset.action;
      if (action === 'create-channel') { channelManager.hideContextMenu(); channelManager.showCreateModal(null, categoryId); }
      else if (action === 'rename') { channelManager.hideContextMenu(); channelManager.showRenameCategoryModal(categoryId, cat.name); }
      else if (action === 'delete') { channelManager.hideContextMenu(); channelManager.showDeleteCategoryConfirm(categoryId); }
    });
    var close = function(e) {
      if (!menu.contains(e.target)) { channelManager.hideContextMenu(); document.removeEventListener('click', close); }
    };
    setTimeout(function() { document.addEventListener('click', close); }, 0);
  },

  showContextMenu: function(channelId, x, y) {
    channelManager.hideContextMenu();
    var ch = (state.channels || []).find(function(c) { return c.id === channelId; });
    if (!ch) return;
    var menu = document.createElement('div');
    menu.id = 'channelContextMenu';
    menu.className = 'context-menu';
    menu.style.cssText = 'position:fixed;top:' + y + 'px;left:' + x + 'px;z-index:2500';
    menu.innerHTML = '<div class="context-menu-item" data-action="rename">Rename</div>' +
      '<div class="context-menu-item danger" data-action="delete">Delete Channel</div>';
    document.body.appendChild(menu);
    var rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
    menu.addEventListener('click', async function(e) {
      var action = e.target.dataset.action;
      if (action === 'rename') { channelManager.hideContextMenu(); channelManager.showRenameModal(channelId, ch.name); }
      else if (action === 'delete') { channelManager.hideContextMenu(); channelManager.showDeleteConfirm(channelId); }
    });
    var close = function(e) {
      if (!menu.contains(e.target)) { channelManager.hideContextMenu(); document.removeEventListener('click', close); }
    };
    setTimeout(function() { document.addEventListener('click', close); }, 0);
  },

  hideContextMenu: function() {
    var m = document.getElementById('channelContextMenu');
    if (m) m.remove();
    var cm = document.getElementById('categoryContextMenu');
    if (cm) cm.remove();
  },

  initDragAndDrop: function() {
    var channelList = document.getElementById('channelList');
    if (!channelList) return;
    var draggedChannel = null;
    var draggedCategory = null;
    var dropTarget = null;
    var dropIndicator = null;

    var createDropIndicator = function() {
      var el = document.createElement('div');
      el.className = 'drop-indicator';
      el.style.cssText = 'height:2px;background:var(--brand);margin:2px 0;border-radius:1px;';
      return el;
    };

    var getDropPosition = function(e, element) {
      var rect = element.getBoundingClientRect();
      return e.clientY < (rect.top + rect.height / 2) ? 'before' : 'after';
    };

    channelList.addEventListener('dragstart', function(e) {
      var channelItem = e.target.closest('.channel-item');
      var categoryHeader = e.target.closest('.category-header');
      if (channelItem) {
        draggedChannel = channelItem.dataset.channel;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedChannel);
        channelItem.style.opacity = '0.5';
      } else if (categoryHeader && categoryHeader.dataset.category !== 'uncategorized') {
        draggedCategory = categoryHeader.dataset.category;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'cat:' + draggedCategory);
        categoryHeader.style.opacity = '0.5';
      }
    });

    channelList.addEventListener('dragend', function(e) {
      var channelItem = e.target.closest('.channel-item');
      var categoryHeader = e.target.closest('.category-header');
      if (channelItem) channelItem.style.opacity = '1';
      if (categoryHeader) categoryHeader.style.opacity = '1';
      if (dropIndicator) { dropIndicator.remove(); dropIndicator = null; }
      draggedChannel = null; draggedCategory = null; dropTarget = null;
    });

    channelList.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedChannel) {
        var targetChannel = e.target.closest('.channel-item');
        var targetHeader = e.target.closest('.category-header');
        if (dropIndicator) dropIndicator.remove();
        dropIndicator = createDropIndicator();
        if (targetChannel && targetChannel.dataset.channel !== draggedChannel) {
          var pos = getDropPosition(e, targetChannel);
          if (pos === 'before') targetChannel.parentNode.insertBefore(dropIndicator, targetChannel);
          else targetChannel.parentNode.insertBefore(dropIndicator, targetChannel.nextSibling);
          dropTarget = { type: 'channel', id: targetChannel.dataset.channel, position: pos };
        } else if (targetHeader) {
          var catId = targetHeader.dataset.category;
          var catChannels = (state.channels || []).filter(function(c) { return c.categoryId === catId; });
          if (catChannels.length === 0) {
            targetHeader.parentNode.insertBefore(dropIndicator, targetHeader.nextSibling);
            dropTarget = { type: 'category', id: catId, position: 'after' };
          } else {
            var firstChannel = channelList.querySelector('.channel-item[data-channel="' + catChannels[0].id + '"]');
            if (firstChannel) {
              targetHeader.parentNode.insertBefore(dropIndicator, firstChannel);
              dropTarget = { type: 'category', id: catId, position: 'first' };
            }
          }
        }
      } else if (draggedCategory) {
        var targetHeader2 = e.target.closest('.category-header');
        if (dropIndicator) dropIndicator.remove();
        dropIndicator = createDropIndicator();
        dropIndicator.style.height = '4px';
        dropIndicator.style.margin = '4px 0';
        if (targetHeader2 && targetHeader2.dataset.category !== draggedCategory && targetHeader2.dataset.category !== 'uncategorized') {
          var pos2 = getDropPosition(e, targetHeader2);
          if (pos2 === 'before') {
            targetHeader2.parentNode.insertBefore(dropIndicator, targetHeader2);
          } else {
            var nextEl = targetHeader2.nextSibling;
            while (nextEl && !nextEl.classList.contains('category-header')) nextEl = nextEl.nextSibling;
            if (nextEl) targetHeader2.parentNode.insertBefore(dropIndicator, nextEl);
            else targetHeader2.parentNode.appendChild(dropIndicator);
          }
          dropTarget = { type: 'category-reorder', id: targetHeader2.dataset.category, position: pos2 };
        }
      }
    });

    channelList.addEventListener('drop', async function(e) {
      e.preventDefault();
      if (dropIndicator) { dropIndicator.remove(); dropIndicator = null; }
      if (draggedChannel && dropTarget) {
        var channels = state.channels || [];
        var draggedCh = channels.find(function(c) { return c.id === draggedChannel; });
        if (draggedCh) {
          var newCategoryId = draggedCh.categoryId;
          if (dropTarget.type === 'channel') {
            var targetCh = channels.find(function(c) { return c.id === dropTarget.id; });
            if (targetCh) {
              newCategoryId = targetCh.categoryId;
              var catChannels2 = channels.filter(function(c) { return c.categoryId === newCategoryId; })
                .sort(function(a, b) { return (a.position || 0) - (b.position || 0); });
              var targetIdx = catChannels2.findIndex(function(c) { return c.id === dropTarget.id; });
              var newPos = dropTarget.position === 'before' ? targetIdx : targetIdx + 1;
              var ids = catChannels2.map(function(c) { return c.id; });
              var fromIdx = ids.indexOf(draggedChannel);
              if (fromIdx !== -1) ids.splice(fromIdx, 1);
              ids.splice(newPos > fromIdx ? newPos - 1 : newPos, 0, draggedChannel);
              try { await channelManager.reorderChannels(newCategoryId, ids); } catch (err) { console.warn('[Channel] Move failed:', err.message); }
            }
          } else if (dropTarget.type === 'category') {
            newCategoryId = dropTarget.id === 'uncategorized' ? null : dropTarget.id;
            var catChannels3 = channels.filter(function(c) { return c.categoryId === newCategoryId; })
              .sort(function(a, b) { return (a.position || 0) - (b.position || 0); });
            var ids2 = catChannels3.map(function(c) { return c.id; });
            if (dropTarget.position === 'first') ids2.unshift(draggedChannel);
            else ids2.push(draggedChannel);
            try { await channelManager.reorderChannels(newCategoryId, ids2); } catch (err) { console.warn('[Channel] Move failed:', err.message); }
          }
        }
      } else if (draggedCategory && dropTarget) {
        var categories = state.categories || [];
        var sorted = categories.slice().sort(function(a, b) { return (a.position || 0) - (b.position || 0); });
        var draggedIdx = sorted.findIndex(function(c) { return c.id === draggedCategory; });
        var targetIdx2 = sorted.findIndex(function(c) { return c.id === dropTarget.id; });
        if (draggedIdx !== -1 && targetIdx2 !== -1) {
          var removed = sorted.splice(draggedIdx, 1)[0];
          var insertIdx = dropTarget.position === 'before' ? targetIdx2 : targetIdx2 + 1;
          sorted.splice(insertIdx, 0, removed);
          var orderedIds = sorted.map(function(c) { return c.id; });
          try { await channelManager.reorderCategories(orderedIds); } catch (err) { console.warn('[Category] Reorder failed:', err.message); }
        }
      }
    });
  }
};

window.channelManager = channelManager;
