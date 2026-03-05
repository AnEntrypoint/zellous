const channelManager = {
  async create(name, type, categoryId) {
    const res = await fetch(`/api/rooms/${state.roomId}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth?.getToken() ? { Authorization: 'Bearer ' + auth.getToken() } : {}) },
      body: JSON.stringify({ name, type, categoryId })
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

  async moveChannel(channelId, categoryId, position) {
    const res = await fetch(`/api/rooms/${state.roomId}/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(auth?.getToken() ? { Authorization: 'Bearer ' + auth.getToken() } : {}) },
      body: JSON.stringify({ categoryId, position })
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

  async createCategory(name) {
    const res = await fetch(`/api/rooms/${state.roomId}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth?.getToken() ? { Authorization: 'Bearer ' + auth.getToken() } : {}) },
      body: JSON.stringify({ name })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    return (await res.json()).category;
  },

  async renameCategory(categoryId, name) {
    const res = await fetch(`/api/rooms/${state.roomId}/categories/${categoryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(auth?.getToken() ? { Authorization: 'Bearer ' + auth.getToken() } : {}) },
      body: JSON.stringify({ name })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    return (await res.json()).category;
  },

  async deleteCategory(categoryId) {
    const res = await fetch(`/api/rooms/${state.roomId}/categories/${categoryId}`, {
      method: 'DELETE',
      headers: auth?.getToken() ? { Authorization: 'Bearer ' + auth.getToken() } : {}
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    return true;
  },

  async reorderChannels(categoryId, orderedIds) {
    const res = await fetch(`/api/rooms/${state.roomId}/channels/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth?.getToken() ? { Authorization: 'Bearer ' + auth.getToken() } : {}) },
      body: JSON.stringify({ categoryId, orderedIds })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    return (await res.json()).channels;
  },

  async reorderCategories(orderedIds) {
    const res = await fetch(`/api/rooms/${state.roomId}/categories/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth?.getToken() ? { Authorization: 'Bearer ' + auth.getToken() } : {}) },
      body: JSON.stringify({ orderedIds })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    return (await res.json()).categories;
  },

  showCreateModal(type, categoryId) {
    const existing = document.getElementById('channelCreateModal');
    if (existing) existing.remove();
    const cats = state.categories || [];
    const categoryOptions = cats.map(c => 
      `<option value="${c.id}" ${c.id === categoryId ? 'selected' : ''}>${c.name}</option>`
    ).join('');
    const modal = document.createElement('div');
    modal.id = 'channelCreateModal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `<div class="modal-box" style="max-width:400px">
      <div class="modal-title">Create Channel</div>
      <div class="modal-error" id="channelCreateError" style="display:none"></div>
      <form id="createChannelForm" onsubmit="return false">
        <div class="modal-field">
          <label class="modal-label">Channel Type</label>
          <select class="modal-input" id="newChannelType">
            <option value="text">Text</option>
            <option value="voice">Voice</option>
            <option value="threaded">Threaded</option>
          </select>
        </div>
        <div class="modal-field">
          <label class="modal-label">Channel Name</label>
          <input type="text" class="modal-input" id="newChannelName" placeholder="new-channel" maxlength="40" autofocus>
        </div>
        <div class="modal-field">
          <label class="modal-label">Category</label>
          <select class="modal-input" id="newChannelCategory">
            <option value="">No Category</option>
            ${categoryOptions}
          </select>
        </div>
        <button type="submit" class="modal-btn" id="createChannelBtn">Create Channel</button>
        <button type="button" class="modal-btn secondary" id="cancelCreateChannel">Cancel</button>
      </form>
    </div>`;
    document.body.appendChild(modal);
    const input = modal.querySelector('#newChannelName');
    const typeSelect = modal.querySelector('#newChannelType');
    const catSelect = modal.querySelector('#newChannelCategory');
    const errEl = modal.querySelector('#channelCreateError');
    const submitBtn = modal.querySelector('#createChannelBtn');
    input.focus();

    const showError = (msg) => {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    };

    modal.querySelector('#createChannelForm').addEventListener('submit', async () => {
      const name = input.value.trim();
      const chType = typeSelect.value;
      const catId = catSelect.value || null;
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
    modal.querySelector('#cancelCreateChannel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  },

  showCreateCategoryModal() {
    const existing = document.getElementById('categoryCreateModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'categoryCreateModal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `<div class="modal-box" style="max-width:360px">
      <div class="modal-title">Create Category</div>
      <div class="modal-error" id="categoryCreateError" style="display:none"></div>
      <form id="createCategoryForm" onsubmit="return false">
        <div class="modal-field">
          <label class="modal-label">Category Name</label>
          <input type="text" class="modal-input" id="newCategoryName" placeholder="Category Name" maxlength="50" autofocus>
        </div>
        <button type="submit" class="modal-btn" id="createCategoryBtn">Create Category</button>
        <button type="button" class="modal-btn secondary" id="cancelCreateCategory">Cancel</button>
      </form>
    </div>`;
    document.body.appendChild(modal);
    const input = modal.querySelector('#newCategoryName');
    const errEl = modal.querySelector('#categoryCreateError');
    const submitBtn = modal.querySelector('#createCategoryBtn');
    input.focus();

    const showError = (msg) => {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    };

    modal.querySelector('#createCategoryForm').addEventListener('submit', async () => {
      const name = input.value.trim();
      errEl.style.display = 'none';
      if (!name) { showError('Category name is required'); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';
      try {
        await channelManager.createCategory(name);
        modal.remove();
      } catch (e) {
        showError(e.message || 'Failed to create category');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Category';
      }
    });
    modal.querySelector('#cancelCreateCategory').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  },

  showCategoryContextMenu(categoryId, x, y) {
    channelManager.hideContextMenu();
    const cat = (state.categories || []).find(c => c.id === categoryId);
    if (!cat) return;
    const menu = document.createElement('div');
    menu.id = 'categoryContextMenu';
    menu.className = 'context-menu';
    menu.style.cssText = `position:fixed;top:${y}px;left:${x}px;z-index:2500`;
    menu.innerHTML = `
      <div class="context-menu-item" data-action="create-channel">Create Channel</div>
      <div class="context-menu-item" data-action="rename">Rename Category</div>
      <div class="context-menu-item danger" data-action="delete">Delete Category</div>`;
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';

    menu.addEventListener('click', async (e) => {
      const action = e.target.dataset.action;
      if (action === 'create-channel') {
        channelManager.hideContextMenu();
        channelManager.showCreateModal(null, categoryId);
      } else if (action === 'rename') {
        channelManager.hideContextMenu();
        channelManager.showRenameCategoryModal(categoryId, cat.name);
      } else if (action === 'delete') {
        channelManager.hideContextMenu();
        if (confirm(`Delete category "${cat.name}"? Channels will be moved to Uncategorized.`)) {
          try { await channelManager.deleteCategory(categoryId); } catch (e) { console.warn('[Category] Delete failed:', e.message); }
        }
      }
    });

    const close = (e) => {
      if (!menu.contains(e.target)) { channelManager.hideContextMenu(); document.removeEventListener('click', close); }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  },

  showRenameCategoryModal(categoryId, currentName) {
    const existing = document.getElementById('categoryRenameModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'categoryRenameModal';
    modal.className = 'modal-overlay open';
    modal.innerHTML = `<div class="modal-box" style="max-width:360px">
      <div class="modal-title">Rename Category</div>
      <form id="renameCategoryForm" onsubmit="return false">
        <div class="modal-field">
          <label class="modal-label">Category Name</label>
          <input type="text" class="modal-input" id="renameCategoryName" value="${currentName}" maxlength="50" autofocus>
        </div>
        <button type="submit" class="modal-btn">Save</button>
        <button type="button" class="modal-btn secondary" id="cancelRenameCategory">Cancel</button>
      </form>
    </div>`;
    document.body.appendChild(modal);
    const input = modal.querySelector('#renameCategoryName');
    input.focus();
    input.select();
    modal.querySelector('#renameCategoryForm').addEventListener('submit', async () => {
      const name = input.value.trim();
      if (!name || name === currentName) { modal.remove(); return; }
      try {
        await channelManager.renameCategory(categoryId, name);
        modal.remove();
      } catch (e) { console.warn('[Category] Rename failed:', e.message); }
    });
    modal.querySelector('#cancelRenameCategory').addEventListener('click', () => modal.remove());
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
  },

  initDragAndDrop() {
    const channelList = document.getElementById('channelList');
    if (!channelList) return;

    let draggedChannel = null;
    let draggedCategory = null;
    let dropTarget = null;
    let dropIndicator = null;

    const createDropIndicator = () => {
      const el = document.createElement('div');
      el.className = 'drop-indicator';
      el.style.cssText = 'height:2px;background:var(--brand);margin:2px 0;border-radius:1px;';
      return el;
    };

    const getDropPosition = (e, element) => {
      const rect = element.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      return e.clientY < midY ? 'before' : 'after';
    };

    channelList.addEventListener('dragstart', (e) => {
      const channelItem = e.target.closest('.channel-item');
      const categoryHeader = e.target.closest('.category-header');
      
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

    channelList.addEventListener('dragend', (e) => {
      const channelItem = e.target.closest('.channel-item');
      const categoryHeader = e.target.closest('.category-header');
      
      if (channelItem) channelItem.style.opacity = '1';
      if (categoryHeader) categoryHeader.style.opacity = '1';
      
      dropIndicator?.remove();
      dropIndicator = null;
      draggedChannel = null;
      draggedCategory = null;
      dropTarget = null;
    });

    channelList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (draggedChannel) {
        const targetChannel = e.target.closest('.channel-item');
        const targetHeader = e.target.closest('.category-header');
        
        dropIndicator?.remove();
        dropIndicator = createDropIndicator();

        if (targetChannel && targetChannel.dataset.channel !== draggedChannel) {
          const pos = getDropPosition(e, targetChannel);
          if (pos === 'before') {
            targetChannel.parentNode.insertBefore(dropIndicator, targetChannel);
          } else {
            targetChannel.parentNode.insertBefore(dropIndicator, targetChannel.nextSibling);
          }
          dropTarget = { type: 'channel', id: targetChannel.dataset.channel, position: pos };
        } else if (targetHeader) {
          const catId = targetHeader.dataset.category;
          const catChannels = (state.channels || []).filter(c => c.categoryId === catId);
          if (catChannels.length === 0) {
            targetHeader.parentNode.insertBefore(dropIndicator, targetHeader.nextSibling);
            dropTarget = { type: 'category', id: catId, position: 'after' };
          } else {
            const firstChannel = channelList.querySelector(`.channel-item[data-channel="${catChannels[0].id}"]`);
            if (firstChannel) {
              targetHeader.parentNode.insertBefore(dropIndicator, firstChannel);
              dropTarget = { type: 'category', id: catId, position: 'first' };
            }
          }
        }
      } else if (draggedCategory) {
        const targetHeader = e.target.closest('.category-header');
        
        dropIndicator?.remove();
        dropIndicator = createDropIndicator();
        dropIndicator.style.height = '4px';
        dropIndicator.style.margin = '4px 0';

        if (targetHeader && targetHeader.dataset.category !== draggedCategory && targetHeader.dataset.category !== 'uncategorized') {
          const pos = getDropPosition(e, targetHeader);
          if (pos === 'before') {
            targetHeader.parentNode.insertBefore(dropIndicator, targetHeader);
          } else {
            let nextEl = targetHeader.nextSibling;
            while (nextEl && !nextEl.classList.contains('category-header')) {
              nextEl = nextEl.nextSibling;
            }
            if (nextEl) {
              targetHeader.parentNode.insertBefore(dropIndicator, nextEl);
            } else {
              targetHeader.parentNode.appendChild(dropIndicator);
            }
          }
          dropTarget = { type: 'category-reorder', id: targetHeader.dataset.category, position: pos };
        }
      }
    });

    channelList.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropIndicator?.remove();
      dropIndicator = null;

      if (draggedChannel && dropTarget) {
        const channels = state.channels || [];
        const draggedCh = channels.find(c => c.id === draggedChannel);
        
        if (draggedCh) {
          let newCategoryId = draggedCh.categoryId;
          let newPosition = 0;

          if (dropTarget.type === 'channel') {
            const targetCh = channels.find(c => c.id === dropTarget.id);
            if (targetCh) {
              newCategoryId = targetCh.categoryId;
              const catChannels = channels.filter(c => c.categoryId === newCategoryId).sort((a, b) => (a.position || 0) - (b.position || 0));
              const targetIdx = catChannels.findIndex(c => c.id === dropTarget.id);
              newPosition = dropTarget.position === 'before' ? targetIdx : targetIdx + 1;
            }
          } else if (dropTarget.type === 'category') {
            newCategoryId = dropTarget.id === 'uncategorized' ? null : dropTarget.id;
            const catChannels = channels.filter(c => c.categoryId === newCategoryId).sort((a, b) => (a.position || 0) - (b.position || 0));
            newPosition = dropTarget.position === 'first' ? 0 : catChannels.length;
          }

          try {
            await channelManager.moveChannel(draggedChannel, newCategoryId, newPosition);
          } catch (err) {
            console.warn('[Channel] Move failed:', err.message);
          }
        }
      } else if (draggedCategory && dropTarget) {
        const categories = state.categories || [];
        const sorted = [...categories].sort((a, b) => (a.position || 0) - (b.position || 0));
        const draggedIdx = sorted.findIndex(c => c.id === draggedCategory);
        const targetIdx = sorted.findIndex(c => c.id === dropTarget.id);

        if (draggedIdx !== -1 && targetIdx !== -1) {
          const [removed] = sorted.splice(draggedIdx, 1);
          const insertIdx = dropTarget.position === 'before' ? targetIdx : targetIdx + 1;
          sorted.splice(insertIdx, 0, removed);
          
          const orderedIds = sorted.map(c => c.id);
          try {
            await channelManager.reorderCategories(orderedIds);
          } catch (err) {
            console.warn('[Category] Reorder failed:', err.message);
          }
        }
      }
    });
  }
};

window.channelManager = channelManager;
