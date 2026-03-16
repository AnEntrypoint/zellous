const showModal = (id, html, onSubmit) => {
  document.getElementById(id)?.remove();
  const modal = document.createElement('div');
  modal.id = id; modal.className = 'modal-overlay open';
  modal.innerHTML = html;
  document.body.appendChild(modal);
  modal.querySelector('form')?.addEventListener('submit', (e) => { e.preventDefault(); onSubmit(modal); });
  modal.querySelector('[data-cancel]')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  setTimeout(() => modal.querySelector('input,select')?.focus(), 0);
  return modal;
};

const setErr = (m, msg) => { const el = m.querySelector('.modal-error'); if (el) { el.textContent = msg; el.style.display = 'block'; } };

const withBtn = async (modal, fn) => {
  const btn = modal.querySelector('[type=submit]');
  const orig = btn.textContent; btn.disabled = true; btn.textContent = orig + '...';
  try { await fn(); modal.remove(); } catch (e) { setErr(modal, e.message || 'Failed'); btn.disabled = false; btn.textContent = orig; }
};

const catOpts = (sel) => (state.categories || []).map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${c.name}</option>`).join('');

const modalBox = (w, title, fields, submitLabel) =>
  `<div class="modal-box" style="max-width:${w}px"><div class="modal-title">${title}</div><div class="modal-error" style="display:none"></div><form onsubmit="return false">${fields}<button type="submit" class="modal-btn">${submitLabel}</button><button type="button" class="modal-btn secondary" data-cancel>Cancel</button></form></div>`;

const inp = (name, val, ph, max) => `<div class="modal-field"><label class="modal-label">${name}</label><input type="text" class="modal-input" name="${name.toLowerCase().replace(/\s/g, '_')}" value="${val}" placeholder="${ph}" maxlength="${max}" autofocus></div>`;
const sel = (name, opts) => `<div class="modal-field"><label class="modal-label">${name}</label><select class="modal-input" name="${name.toLowerCase().replace(/\s/g, '_')}">${opts}</select></div>`;

const popMenu = (id, x, y, items, onAction) => {
  document.getElementById(id)?.remove();
  const menu = document.createElement('div');
  menu.id = id; menu.className = 'context-menu';
  menu.style.cssText = `position:fixed;top:${y}px;left:${x}px;z-index:2500`;
  menu.innerHTML = items.map(([a, label, cls]) => `<div class="context-menu-item${cls ? ' ' + cls : ''}" data-action="${a}">${label}</div>`).join('');
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
  menu.addEventListener('click', (e) => { const a = e.target.dataset.action; if (a) onAction(a); });
  setTimeout(() => document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.remove(); }, { once: true }), 0);
};

const channelManager = {
  showCreateModal(type, categoryId) {
    showModal('channelCreateModal', modalBox(400, 'Create Channel',
      sel('Channel Type', '<option value="text">Text</option><option value="voice">Voice</option><option value="threaded">Threaded</option>') +
      inp('Channel Name', '', 'new-channel', 40) +
      sel('Category', `<option value="">No Category</option>${catOpts(categoryId)}`),
      'Create Channel'), (m) => withBtn(m, () => {
        const name = m.querySelector('[name=channel_name]').value.trim();
        if (!name) throw new Error('Channel name is required');
        return channelApi.create(name, m.querySelector('[name=channel_type]').value, m.querySelector('[name=category]').value || null);
      }));
  },

  showCreateCategoryModal() {
    showModal('categoryCreateModal', modalBox(360, 'Create Category', inp('Category Name', '', 'Category Name', 50), 'Create Category'),
      (m) => withBtn(m, () => { const name = m.querySelector('[name=category_name]').value.trim(); if (!name) throw new Error('Category name is required'); return channelApi.createCategory(name); }));
  },

  showRenameModal(channelId, cur) {
    showModal('channelRenameModal', modalBox(360, 'Rename Channel', inp('Channel Name', cur, '', 40), 'Save'),
      (m) => { const name = m.querySelector('[name=channel_name]').value.trim(); if (!name || name === cur) { m.remove(); return; } return channelApi.rename(channelId, name).then(() => m.remove()); });
  },

  showRenameCategoryModal(categoryId, cur) {
    showModal('categoryRenameModal', modalBox(360, 'Rename Category', inp('Category Name', cur, '', 50), 'Save'),
      (m) => { const name = m.querySelector('[name=category_name]').value.trim(); if (!name || name === cur) { m.remove(); return; } return channelApi.renameCategory(categoryId, name).then(() => m.remove()); });
  },

  hideContextMenu() { document.getElementById('channelContextMenu')?.remove(); document.getElementById('categoryContextMenu')?.remove(); },

  showContextMenu(channelId, x, y) {
    const ch = state.channels.find(c => c.id === channelId); if (!ch) return;
    this.hideContextMenu();
    popMenu('channelContextMenu', x, y, [['rename', 'Rename', ''], ['delete', 'Delete Channel', 'danger']], (action) => {
      this.hideContextMenu();
      if (action === 'rename') this.showRenameModal(channelId, ch.name);
      else if (action === 'delete' && confirm(`Delete #${ch.name}?`)) channelApi.remove(channelId).catch(e => console.warn('[Channel] Delete failed:', e.message));
    });
  },

  showCategoryContextMenu(categoryId, x, y) {
    const cat = (state.categories || []).find(c => c.id === categoryId); if (!cat) return;
    this.hideContextMenu();
    popMenu('categoryContextMenu', x, y, [['create-channel', 'Create Channel', ''], ['rename', 'Rename Category', ''], ['delete', 'Delete Category', 'danger']], (action) => {
      this.hideContextMenu();
      if (action === 'create-channel') this.showCreateModal(null, categoryId);
      else if (action === 'rename') this.showRenameCategoryModal(categoryId, cat.name);
      else if (action === 'delete' && confirm(`Delete category "${cat.name}"? Channels will be moved to Uncategorized.`)) channelApi.deleteCategory(categoryId).catch(e => console.warn('[Category] Delete failed:', e.message));
    });
  },

  initDragAndDrop() {
    const list = document.getElementById('channelList'); if (!list) return;
    let dragCh = null, dragCat = null, dropTarget = null, indicator = null;
    const mkInd = (t) => { const el = document.createElement('div'); el.className = 'drop-indicator'; el.style.cssText = `height:${t?4:2}px;background:var(--brand);margin:${t?4:2}px 0;border-radius:1px;`; return el; };
    const midY = (e, el) => e.clientY < el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 ? 'before' : 'after';

    list.addEventListener('dragstart', (e) => {
      const ch = e.target.closest('.channel-item'), cat = e.target.closest('.category-header');
      if (ch) { dragCh = ch.dataset.channel; e.dataTransfer.effectAllowed = 'move'; ch.style.opacity = '0.5'; }
      else if (cat && cat.dataset.category !== 'uncategorized') { dragCat = cat.dataset.category; e.dataTransfer.effectAllowed = 'move'; cat.style.opacity = '0.5'; }
    });
    list.addEventListener('dragend', (e) => {
      e.target.closest('.channel-item')?.style && (e.target.closest('.channel-item').style.opacity = '1');
      e.target.closest('.category-header')?.style && (e.target.closest('.category-header').style.opacity = '1');
      indicator?.remove(); indicator = dragCh = dragCat = dropTarget = null;
    });
    list.addEventListener('dragover', (e) => {
      e.preventDefault(); indicator?.remove(); indicator = null;
      if (dragCh) {
        const tch = e.target.closest('.channel-item'), th = e.target.closest('.category-header');
        indicator = mkInd(false);
        if (tch && tch.dataset.channel !== dragCh) { const pos = midY(e, tch); tch.parentNode.insertBefore(indicator, pos === 'before' ? tch : tch.nextSibling); dropTarget = { type: 'channel', id: tch.dataset.channel, position: pos }; }
        else if (th) { const id = th.dataset.category, cc = (state.channels||[]).filter(c=>c.categoryId===id); if (!cc.length) { th.parentNode.insertBefore(indicator, th.nextSibling); dropTarget = { type: 'category', id, position: 'after' }; } else { const fc = list.querySelector(`.channel-item[data-channel="${cc[0].id}"]`); if (fc) { th.parentNode.insertBefore(indicator, fc); dropTarget = { type: 'category', id, position: 'first' }; } } }
      } else if (dragCat) {
        const th = e.target.closest('.category-header');
        indicator = mkInd(true);
        if (th && th.dataset.category !== dragCat && th.dataset.category !== 'uncategorized') { const pos = midY(e, th); if (pos === 'before') { th.parentNode.insertBefore(indicator, th); } else { let n = th.nextSibling; while (n && !n.classList?.contains('category-header')) n = n.nextSibling; n ? th.parentNode.insertBefore(indicator, n) : th.parentNode.appendChild(indicator); } dropTarget = { type: 'category-reorder', id: th.dataset.category, position: pos }; }
      }
    });
    list.addEventListener('drop', async (e) => {
      e.preventDefault(); indicator?.remove(); indicator = null;
      if (dragCh && dropTarget) {
        const channels = state.channels||[], dch = channels.find(c=>c.id===dragCh);
        if (dch) {
          let newCat = dch.categoryId, newPos = 0;
          if (dropTarget.type === 'channel') { const t = channels.find(c=>c.id===dropTarget.id); if (t) { newCat = t.categoryId; const cc = channels.filter(c=>c.categoryId===newCat).sort((a,b)=>(a.position||0)-(b.position||0)); const ti = cc.findIndex(c=>c.id===dropTarget.id); newPos = dropTarget.position==='before'?ti:ti+1; } }
          else if (dropTarget.type === 'category') { newCat = dropTarget.id==='uncategorized'?null:dropTarget.id; const cc = channels.filter(c=>c.categoryId===newCat).sort((a,b)=>(a.position||0)-(b.position||0)); newPos = dropTarget.position==='first'?0:cc.length; }
          channelApi.moveChannel(dragCh, newCat, newPos).catch(e => console.warn('[Channel] Move failed:', e.message));
        }
      } else if (dragCat && dropTarget) {
        const sorted = [...(state.categories||[])].sort((a,b)=>(a.position||0)-(b.position||0));
        const di = sorted.findIndex(c=>c.id===dragCat), ti = sorted.findIndex(c=>c.id===dropTarget.id);
        if (di!==-1 && ti!==-1) { const [r] = sorted.splice(di,1); sorted.splice(dropTarget.position==='before'?ti:ti+1,0,r); channelApi.reorderCategories(sorted.map(c=>c.id)).catch(e => console.warn('[Category] Reorder failed:', e.message)); }
      }
    });
  },
};

window.channelManager = channelManager;
