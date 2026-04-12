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
    if (channel.type === 'voice' && window.lk) {
      if (state.voiceConnected && state.voiceChannelName === channel.name) {
        lk.disconnect();
      } else if (!state.voiceConnected) {
        lk.connect(channel.name, { forceRelay: localStorage.getItem('zellous_forceRelay') === 'true' });
      }
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
