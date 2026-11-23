const ui = {
  videoPlayback: document.getElementById('videoPlayback'),
  videoPlaybackVideo: document.getElementById('videoPlaybackVideo'),
  videoPlaybackLabel: document.getElementById('videoPlaybackLabel'),
  fileInput: document.getElementById('fileInput'),
  authModal: document.getElementById('authModal'),
  authError: document.getElementById('authError'),
  settingsPopover: document.getElementById('settingsPopover'),
  _replyTarget: null,
};

const getInitial = (name) => (name || '?')[0].toUpperCase();
const getAvatarColor = (id) => {
  const colors = window.AVATAR_COLORS;
  const h = Math.abs(typeof id === 'number' ? id : [...(id||'')].reduce((a,c)=>a+c.charCodeAt(0),0));
  return colors[h % colors.length];
};
const escHtml = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const formatTime = (ts) => {
  const d = new Date(ts), now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return 'Today at ' + time;
  const y = new Date(now); y.setDate(y.getDate()-1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday at ' + time;
  return d.toLocaleDateString() + ' ' + time;
};
ui.render = {
  all() { if (window.serverManager) serverManager.renderList(); },
  messages() {},
  queue() {},
  authStatus() {}
};

ui.confirm = function({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay open';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    const box = document.createElement('div');
    box.className = 'modal-box';
    const heading = document.createElement('h2');
    heading.className = 'modal-title';
    heading.id = 'confirmTitle';
    heading.textContent = title;
    const body = document.createElement('div');
    body.className = 'modal-subtitle';
    body.id = 'confirmMessage';
    body.style.marginTop = '0';
    body.textContent = message || '';
    modal.setAttribute('aria-labelledby', 'confirmTitle');
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'modal-btn secondary';
    cancel.textContent = 'Cancel';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'modal-btn' + (danger ? ' danger' : '');
    ok.textContent = confirmLabel;
    actions.append(cancel, ok);
    box.append(heading);
    if (message) { box.append(body); modal.setAttribute('aria-describedby', 'confirmMessage'); }
    box.append(actions);
    modal.append(box);
    const done = (value) => {
      modal.remove();
      document.removeEventListener('keydown', onKey, true);
      if (opener && opener.focus) opener.focus();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        (document.activeElement === ok ? cancel : ok).focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    cancel.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));
    modal.addEventListener('click', (e) => { if (e.target === modal) done(false); });
    document.body.appendChild(modal);
    (danger ? cancel : ok).focus();
  });
};

ui.showFirstRunKeyNotice = function() {
  var flag = 'zellous-firstrun-key-notice';
  try { if (localStorage.getItem(flag) === '1') return; } catch (_) {}
  var modal = document.createElement('div');
  modal.id = 'firstRunKeyNotice';
  modal.className = 'modal-overlay open';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'frKeyTitle');
  modal.innerHTML = '<div class="modal-box" style="max-width:440px">' +
    '<h2 class="modal-title" id="frKeyTitle">zellous made you an identity</h2>' +
    '<p style="font-size:13px;color:var(--fg-2);margin:0">To let you look around before signing in, zellous generated a Nostr key and saved it in this browser only. There is no password, no email and no recovery: clearing site data, a private window, or another device loses this identity and everything posted under it, permanently.</p>' +
    '<div class="modal-actions"><button type="button" class="modal-btn secondary" id="frSkip">Continue without a backup</button><button type="button" class="modal-btn" id="frBackup">Back up key</button></div></div>';
  document.body.appendChild(modal);
  try { localStorage.setItem(flag, '1'); } catch (_) {}
  var dismiss = function() { modal.remove(); setTimeout(function() { if (ui.showSetupToast) ui.showSetupToast(); }, 400); };
  modal.querySelector('#frSkip').addEventListener('click', dismiss);
  modal.querySelector('#frBackup').addEventListener('click', function() {
    dismiss();
    if (window.channelManager && window.channelManager.showKeyBackupModal) window.channelManager.showKeyBackupModal();
  });
  setTimeout(function() { var b = modal.querySelector('#frBackup'); if (b) b.focus(); }, 0);
};

ui.showSetupToast = function() {
  var setup = window.nostrSetup;
  if (!setup) return;
  var st = setup.get();
  if (st.toastShown || st.dismissed) return;
  setup.set({ toastShown: true });
  ui.showToast('Set up your profile', 12000, null, 'Add a name, a picture and back up your key. Takes a minute.', { label: 'Set up', onClick: function() { setup.open(''); } });
};

ui.showToast = function(msg, duration, tone, sub, action) {
  document.getElementById('uiToast')?.remove();
  const el = document.createElement('div');
  el.id = 'uiToast';
  el.className = 'ds-g3-toast' + (tone === 'error' ? ' error' : '');
  el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  const title = document.createElement('b');
  title.textContent = String(msg);
  el.appendChild(title);
  if (sub) {
    const line = document.createElement('span');
    line.textContent = String(sub);
    el.appendChild(line);
  }
  if (action && action.label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ds-g3-toast-act';
    btn.textContent = action.label;
    btn.addEventListener('click', (e) => { e.stopPropagation(); el.remove(); action.onClick && action.onClick(); });
    el.appendChild(btn);
  }
  el.addEventListener('click', () => el.remove());
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration || 3000);
};

window.__zellous.ui = ui;
window.ui = ui;
window.getInitial = getInitial;
window.getAvatarColor = getAvatarColor;
window.escHtml = escHtml;
window.formatTime = formatTime;
