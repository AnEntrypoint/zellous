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
  if (!window.getIcon) return { text:'#', voice:'🔊', threaded:'📋', announcement:'📢', forum:'💬', thread:'🧵' }[type] || '#';
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

ui.actions = {
  switchChannel(channel) {
    state.currentChannel = channel;
    state.currentChannelId = channel.id;
    state.messages = [];
    ui.render.channels();
    ui.render.channelView();
    if (channel.type === 'text' || channel.type === 'announcement') {
      state.chatMessages = [];
      ui.render.chat();
      if (window.chat?.loadHistory) {
        chat.loadHistory(channel.id);
      } else {
        network.send({ type: 'get_messages', limit: 50, channelId: channel.id });
      }
    }
    if (channel.type === 'voice' && !state.voiceConnected && window.lk) {
      lk.connect(channel.name, { forceRelay: localStorage.getItem('zellous_forceRelay') === 'true' });
    }
    ui.channelSidebar?.classList.remove('open');
    ui.drawerOverlay?.classList.remove('open');
    ui._replyTarget = null;
    document.getElementById('replyComposeBar')?.remove();
  },
  showAuthModal() {
    if (!ui.authModal) return;
    if (document.getElementById('nostrConnectView')) {
      if (window.auth?.showModal) auth.showModal();
      return;
    }
    ui.authModal.classList.add('open');
    if (ui.authError) ui.authError.style.display = 'none';
    const logged = auth?.isLoggedIn?.();
    document.getElementById('loginForm').style.display = logged ? 'none' : 'block';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('userMenu').style.display = logged ? 'block' : 'none';
    document.getElementById('authModalTabs').style.display = logged ? 'none' : 'flex';
    document.getElementById('authModalTitle').textContent = logged ? 'Account' : 'Welcome back!';
    document.getElementById('authModalSubtitle').textContent = logged ? '' : 'Log in to continue to Zellous';
    if (logged) {
      const name = auth.user.displayName || auth.user.username;
      document.getElementById('profileAvatar').textContent = getInitial(name);
      document.getElementById('profileName').textContent = name;
      document.getElementById('profileTag').textContent = '@' + auth.user.username;
    } else {
      document.getElementById('loginTab')?.classList.add('active');
      document.getElementById('registerTab')?.classList.remove('active');
    }
  },
  hideAuthModal() { ui.authModal?.classList.remove('open'); },
  async login(username, password) {
    try {
      if (ui.authError) ui.authError.style.display = 'none';
      await auth.login(username, password); this.hideAuthModal(); ui.render.authStatus();
    } catch (e) { if (ui.authError) { ui.authError.textContent = e.message; ui.authError.style.display = 'block'; } }
  },
  async register(username, password, displayName) {
    try {
      if (ui.authError) ui.authError.style.display = 'none';
      await auth.register(username, password, displayName);
      await auth.login(username, password); this.hideAuthModal(); ui.render.authStatus();
    } catch (e) { if (ui.authError) { ui.authError.textContent = e.message; ui.authError.style.display = 'block'; } }
  },
  async logout() { await auth.logout(); this.hideAuthModal(); ui.render.authStatus(); },
  sendChat() { if (window.uiChat) uiChat.sendChat(); },
  startReply(msgId) { if (window.uiChat) uiChat.startReply(msgId); },
  startEdit(msgId) { if (window.uiChat) uiChat.startEdit(msgId); },
  showEmojiPicker(msgId, btn) { if (window.uiChat) uiChat.showEmojiPicker(msgId, btn); },
  uploadFile() { ui.fileInput?.click(); },
  handleFileSelect(e) {
    const files = e.target.files;
    if (!files?.length) return;
    for (const file of files) { file.type.startsWith('image/') ? chat.sendImage(file) : fileTransfer.upload(file); }
    e.target.value = '';
  },
  toggleMembers() { document.getElementById('memberList')?.classList.toggle('open'); },
  toggleQueue() { document.getElementById('queueSidebar')?.classList.toggle('open'); },
  toggleSettings() { ui.settingsPopover?.classList.toggle('open'); },
  openMobileMenu() { ui.channelSidebar?.classList.add('open'); ui.drawerOverlay?.classList.add('open'); },
  closeMobileMenu() {
    ui.channelSidebar?.classList.remove('open'); ui.drawerOverlay?.classList.remove('open');
    document.getElementById('memberList')?.classList.remove('open');
    document.getElementById('queueSidebar')?.classList.remove('open');
  }
};

window.ui = ui;
window.getInitial = getInitial;
window.getAvatarColor = getAvatarColor;
window.escHtml = escHtml;
window.formatTime = formatTime;
window.chIcon = chIcon;
