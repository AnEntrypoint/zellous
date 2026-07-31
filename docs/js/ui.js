const ui = {
  videoPlayback: document.getElementById('videoPlayback'),
  videoPlaybackVideo: document.getElementById('videoPlaybackVideo'),
  videoPlaybackLabel: document.getElementById('videoPlaybackLabel'),
  fileInput: document.getElementById('fileInput'),
  authModal: document.getElementById('authModal'),
  authError: document.getElementById('authError'),
  drawerOverlay: document.getElementById('drawerOverlay'),
  settingsPopover: document.getElementById('settingsPopover'),
  _replyTarget: null,
};

const getInitial = (name) => (name || '?')[0].toUpperCase();
const getAvatarColor = (id) => {
  const colors = window.AVATAR_COLORS || ['#3F8A4A'];
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
const chIcon = (type) => {
  if (!window.getIcon) return '#';
  const map = { text:'text', voice:'voiceAlt', threaded:'ptt', announcement:'announcement', forum:'forum', thread:'thread', stage:'stage' };
  return getIcon(map[type] || 'text');
};

// Real UI rendering is owned by the SDK's mountCommunityApp (see AGENTS.md
// GUI ownership) -- it re-renders reactively off nostr-adapter.js's tracked
// signals. These entry points exist only so call sites elsewhere (event
// bridges, feature modules) that used to trigger the old hand-rolled DOM
// render still have something to call; they are intentional no-ops.
ui.render = {
  all() { if (window.serverManager) serverManager.renderList(); },
  messages() {},
  speakers() {},
  channels() {},
  channelView() {},
  voiceGrid() {},
  voiceTurnOrder() {},
  members() {},
  chat() {},
  queue() {},
  voicePanel() {},
  authStatus() {}
};

ui.showToast = function(msg, duration, tone) {
  const sdkToast = window.__sdk?.C?.toast;
  if (typeof sdkToast === 'function') {
    sdkToast({ message: String(msg), kind: tone || 'info', duration: duration || 3000 });
    return;
  }
  // Fallback (SDK not loaded yet, or failed to load) — original inline toast.
  document.getElementById('uiToast')?.remove();
  const el = document.createElement('div');
  el.id = 'uiToast';
  el.textContent = msg;
  el.style.cssText = 'position:fixed;bottom:calc(80px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);background:var(--bg-2);color:var(--fg);padding:8px 18px;border-radius:6px;z-index:9999;font-size:14px;pointer-events:none;opacity:1;transition:opacity 0.3s';
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 350); }, duration || 2000);
};

window.__zellous.ui = ui;
window.ui = ui;
window.getInitial = getInitial;
window.getAvatarColor = getAvatarColor;
window.escHtml = escHtml;
window.formatTime = formatTime;
window.chIcon = chIcon;
