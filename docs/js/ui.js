const ui = {
  ptt: document.getElementById('pttBtn'),
  pttStatus: document.getElementById('pttStatus'),
  pttStatusText: document.getElementById('pttStatusText'),
  volumeSlider: document.getElementById('volume'),
  volumeValue: document.getElementById('volValue'),
  deafenBtn: document.getElementById('deafenBtn'),
  vadBtn: document.getElementById('vadBtn'),
  vadControls: document.getElementById('vadControls'),
  vadThreshold: document.getElementById('vadThreshold'),
  vadValue: document.getElementById('vadValue'),
  vadMeterContainer: document.getElementById('vadMeterContainer'),
  vadMeter: document.getElementById('vadMeter'),
  vadThresholdMarker: document.getElementById('vadThresholdMarker'),
  webcamBtn: document.getElementById('webcamBtn'),
  webcamPreview: document.getElementById('webcamPreview'),
  webcamVideo: document.getElementById('webcamVideo'),
  webcamResolution: document.getElementById('webcamResolution'),
  webcamFps: document.getElementById('webcamFps'),
  webcamControls: document.getElementById('webcamControls'),
  inputDevice: document.getElementById('inputDevice'),
  outputDevice: document.getElementById('outputDevice'),
  videoPlayback: document.getElementById('videoPlayback'),
  videoPlaybackVideo: document.getElementById('videoPlaybackVideo'),
  videoPlaybackLabel: document.getElementById('videoPlaybackLabel'),
  chatInput: document.getElementById('chatInput'),
  chatMessages: document.getElementById('chatMessages'),
  chatMessagesInner: document.getElementById('chatMessagesInner'),
  fileInput: document.getElementById('fileInput'),
  audioQueueView: document.getElementById('audioQueueView'),
  channelList: document.getElementById('channelList'),
  memberList: document.getElementById('memberList'),
  onlineMembers: document.getElementById('onlineMembers'),
  onlineHeader: document.getElementById('onlineHeader'),
  chatHeaderName: document.getElementById('chatHeaderName'),
  chatHeaderIcon: document.getElementById('chatHeaderIcon'),
  chatHeaderTopic: document.getElementById('chatHeaderTopic'),
  chatArea: document.getElementById('chatArea'),
  voiceView: document.getElementById('voiceView'),
  voiceGrid: document.getElementById('voiceGrid'),
  threadedView: document.getElementById('threadedView'),
  voicePanel: document.getElementById('voicePanel'),
  voicePanelChannel: document.getElementById('voicePanelChannel'),
  serverHeader: document.getElementById('serverHeader'),
  authModal: document.getElementById('authModal'),
  authError: document.getElementById('authError'),
  userPanelName: document.getElementById('userPanelName'),
  userPanelTag: document.getElementById('userPanelTag'),
  userPanelAvatar: document.getElementById('userPanelAvatar'),
  userStatusDot: document.getElementById('userStatusDot'),
  mobileTitle: document.getElementById('mobileTitle'),
  channelSidebar: document.getElementById('channelSidebar'),
  drawerOverlay: document.getElementById('drawerOverlay'),
  settingsPopover: document.getElementById('settingsPopover'),
  _replyTarget: null,
};

const getInitial = (name) => (name || '?')[0].toUpperCase();
const avatarColors = ['#5865f2','#57f287','#feb347','#fe7168','#9b59b6','#1abc9c','#e67e22','#e74c3c'];
const getAvatarColor = (id) => avatarColors[Math.abs(typeof id === 'number' ? id : [...(id||'')].reduce((a,c)=>a+c.charCodeAt(0),0)) % avatarColors.length];
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

ui.render = {
  all() { this.channels(); this.members(); this.chat(); this.queue(); this.authStatus(); this.channelView(); this.voicePanel(); if (window.serverManager) serverManager.renderList(); },
  messages() { if (window.uiChat) uiChat.messages(); },
  speakers() { this.voiceGrid?.(); this.channels?.(); this.voiceTurnOrder?.(); },
  channels() { if (window.uiChannels) uiChannels.render(); },
  channelView() { if (window.uiChannels) uiChannels.renderView(); },
  voiceGrid() { if (window.uiVoice) uiVoice.renderGrid(); },
  voiceTurnOrder() { if (window.uiVoice) uiVoice.renderTurnOrder(); },
  members() { if (window.uiMembers) uiMembers.render(); },
  chat() { if (window.uiChat) uiChat.render(); },
  queue() { if (window.uiVoice) uiVoice.renderQueue(); },
  voicePanel() { if (window.uiVoice) uiVoice.renderPanel(); },
  authStatus() {
    if (!ui.userPanelName) return;
    const nostrUser = window.auth?.user;
    const isLoggedIn = (state.isAuthenticated && state.currentUser) || (nostrUser && state.nostrPubkey);
    if (isLoggedIn) {
      const user = state.currentUser || nostrUser;
      const name = user.displayName || user.username;
      ui.userPanelName.textContent = name;
      ui.userPanelTag.textContent = state.nostrPubkey ? window.auth.npubShort(state.nostrPubkey) : '@' + user.username;
      const node = ui.userPanelAvatar?.childNodes[0];
      if (node?.nodeType === 3) node.textContent = getInitial(name);
      ui.userStatusDot?.classList.add('online');
    } else {
      ui.userPanelName.textContent = 'Not logged in';
      ui.userPanelTag.textContent = 'Click to login';
      const node = ui.userPanelAvatar?.childNodes[0];
      if (node?.nodeType === 3) node.textContent = '?';
      ui.userStatusDot?.classList.remove('online');
    }
  }
};

ui.showToast = function(msg, duration) {
  document.getElementById('uiToast')?.remove();
  const el = document.createElement('div');
  el.id = 'uiToast';
  el.textContent = msg;
  el.style.cssText = 'position:fixed;bottom:calc(80px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);background:#23272a;color:#fff;padding:8px 18px;border-radius:6px;z-index:9999;font-size:14px;pointer-events:none;opacity:1;transition:opacity 0.3s';
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 350); }, duration || 2000);
};

window.__zellous.ui = ui;
window.getInitial = getInitial;
window.getAvatarColor = getAvatarColor;
window.escHtml = escHtml;
window.formatTime = formatTime;
window.chIcon = chIcon;
