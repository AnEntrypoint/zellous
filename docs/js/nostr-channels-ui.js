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
    '<div class="modal-field"><label class="modal-label">Channel Type</label><select class="modal-input" id="ccType">' + window.zModules.createOptions().map(function(o) { return '<option value="' + escHtml(o.value) + '">' + escHtml(o.label) + '</option>'; }).join('') + '</select></div>' +
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

