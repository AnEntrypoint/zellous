var serverPages = {
  _store: new Map(),
  _subs: new Map(),

  _sanitize(html) {
    const el = document.createElement('div');
    el.innerHTML = html;
    el.querySelectorAll('script,iframe,object,embed,form,input,button').forEach(n => n.remove());
    el.querySelectorAll('*').forEach(n => {
      [...n.attributes].forEach(a => {
        if (/^on/i.test(a.name) || (a.name === 'href' && /^javascript:/i.test(a.value)) || (a.name === 'src' && /^javascript:/i.test(a.value))) n.removeAttribute(a.name);
      });
    });
    return el.innerHTML;
  },

  _pageKey(serverId, slug) { return 'zellous-page:' + serverId + ':' + slug; },

  getPages(serverId) { return Array.from((serverPages._store.get(serverId) || new Map()).values()); },

  subscribe(serverId) {
    if (serverPages._subs.has(serverId)) return;
    var creator = serverId ? serverId.split(':')[0] : null;
    if (!creator) return;
    var subId = 'pages-' + serverId;
    serverPages._subs.set(serverId, subId);
    nostrNet.subscribe(subId,
      [{ kinds: [30078], authors: [creator] }],
      function(event) {
        if (event.pubkey !== creator) return;
        var dTag = (event.tags.find(function(t) { return t[0] === 'd'; }) || [])[1] || '';
        var prefix = 'zellous-page:' + serverId + ':';
        if (!dTag.startsWith(prefix)) return;
        var slug = dTag.slice(prefix.length);
        if (!slug) return;
        try {
          var data = JSON.parse(event.content);
          var pages = serverPages._store.get(serverId) || new Map();
          if (data.deleted) { pages.delete(slug); } else {
            pages.set(slug, { slug: slug, title: data.title || slug, html: serverPages._sanitize(data.html || ''), updatedAt: event.created_at });
          }
          serverPages._store.set(serverId, pages);
          if (window.uiChannels) uiChannels.render();
        } catch(e) {}
      },
      function() {}
    );
  },

  unsubscribe(serverId) {
    var subId = serverPages._subs.get(serverId);
    if (subId) { nostrNet.unsubscribe(subId); serverPages._subs.delete(serverId); }
  },

  async publish(serverId, slug, title, html) {
    if (!serverRoles.isAdmin(serverId)) throw new Error('Admin only');
    var safe = serverPages._sanitize(html);
    var dTag = serverPages._pageKey(serverId, slug);
    var signed = await auth.sign({ kind: 30078, created_at: Math.floor(Date.now() / 1000), tags: [['d', dTag]], content: JSON.stringify({ title: title, html: safe }) });
    await nostrNet.publish(signed);
    var pages = serverPages._store.get(serverId) || new Map();
    pages.set(slug, { slug: slug, title: title, html: safe, updatedAt: Math.floor(Date.now() / 1000) });
    serverPages._store.set(serverId, pages);
    if (window.uiChannels) uiChannels.render();
  },

  async deletePage(serverId, slug) {
    if (!serverRoles.isAdmin(serverId)) throw new Error('Admin only');
    var dTag = serverPages._pageKey(serverId, slug);
    var signed = await auth.sign({ kind: 30078, created_at: Math.floor(Date.now() / 1000), tags: [['d', dTag]], content: JSON.stringify({ deleted: true }) });
    await nostrNet.publish(signed);
    var pages = serverPages._store.get(serverId) || new Map();
    pages.delete(slug);
    serverPages._store.set(serverId, pages);
    if (window.uiChannels) uiChannels.render();
  },

  showEditModal(serverId, existing) {
    document.getElementById('pageEditModal')?.remove();
    var modal = document.createElement('div');
    modal.id = 'pageEditModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    var slug = existing ? existing.slug : 'page-' + Date.now().toString(36);
    modal.innerHTML = '<div class="modal" style="max-width:680px;width:95%">' +
      '<div class="modal-header"><span class="modal-title">' + (existing ? 'Edit Page' : 'New Page') + '</span>' +
      '<button class="modal-close" id="pageModalClose">&times;</button></div>' +
      '<div class="modal-body" style="display:flex;flex-direction:column;gap:12px">' +
      '<input id="pageModalTitle" class="modal-input" placeholder="Page title" value="' + escHtml(existing ? existing.title : '') + '">' +
      '<div id="pageModalEditor" class="page-editor" contenteditable="true" style="min-height:220px;background:var(--bg-raised);border:1px solid var(--border);border-radius:6px;padding:12px;overflow-y:auto;font-size:14px;line-height:1.6"></div>' +
      '<div class="page-editor-toolbar" style="display:flex;gap:6px;flex-wrap:wrap">' +
      '<button class="page-tb-btn" data-cmd="bold"><b>B</b></button>' +
      '<button class="page-tb-btn" data-cmd="italic"><i>I</i></button>' +
      '<button class="page-tb-btn" data-cmd="underline"><u>U</u></button>' +
      '<button class="page-tb-btn" data-cmd="insertUnorderedList">&#8226;</button>' +
      '<button class="page-tb-btn" data-cmd="insertOrderedList">1.</button>' +
      '</div>' +
      '</div>' +
      '<div class="modal-footer">' +
      (existing ? '<button class="modal-btn danger" id="pageModalDelete">Delete</button>' : '') +
      '<button class="modal-btn secondary" id="pageModalCancel">Cancel</button>' +
      '<button class="modal-btn primary" id="pageModalSave">Save</button>' +
      '</div></div>';
    document.body.appendChild(modal);
    var editor = document.getElementById('pageModalEditor');
    if (existing) editor.innerHTML = existing.html;
    modal.querySelectorAll('.page-tb-btn').forEach(function(btn) {
      btn.addEventListener('mousedown', function(e) { e.preventDefault(); document.execCommand(btn.dataset.cmd, false, null); editor.focus(); });
    });
    document.getElementById('pageModalClose').addEventListener('click', function() { modal.remove(); });
    document.getElementById('pageModalCancel').addEventListener('click', function() { modal.remove(); });
    if (existing) {
      document.getElementById('pageModalDelete').addEventListener('click', async function() {
        if (!confirm('Delete this page?')) return;
        try { await serverPages.deletePage(serverId, slug); modal.remove(); } catch(e) { alert(e.message); }
      });
    }
    document.getElementById('pageModalSave').addEventListener('click', async function() {
      var title = document.getElementById('pageModalTitle').value.trim();
      if (!title) { alert('Title required'); return; }
      try { await serverPages.publish(serverId, slug, title, editor.innerHTML); modal.remove(); } catch(e) { alert(e.message); }
    });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  },

  renderPageView(serverId, slug) {
    var pages = serverPages._store.get(serverId) || new Map();
    var page = pages.get(slug);
    var area = document.getElementById('pageView');
    if (!area) return;
    var isAdmin = window.serverRoles && serverRoles.isAdmin(serverId);
    area.innerHTML = '<div class="page-view-header">' +
      '<span class="page-view-title">' + escHtml(page ? page.title : slug) + '</span>' +
      (isAdmin ? '<button class="modal-btn secondary page-edit-btn" id="pageEditBtn">Edit</button>' : '') +
      '</div>' +
      '<div class="page-view-body">' + (page ? page.html : '<p style="color:var(--text-muted)">No content yet.</p>') + '</div>';
    if (isAdmin) {
      document.getElementById('pageEditBtn').addEventListener('click', function() {
        serverPages.showEditModal(serverId, page || { slug: slug, title: slug, html: '' });
      });
    }
  }
};

window.__zellous.pages = serverPages;
window.serverPages = serverPages;
if (!window.__debug) window.__debug = {};
Object.defineProperty(window.__debug, 'pages', { get: function() {
  var out = {};
  serverPages._store.forEach(function(pages, srv) { out[srv] = Array.from(pages.keys()); });
  return out;
}, configurable: true });
