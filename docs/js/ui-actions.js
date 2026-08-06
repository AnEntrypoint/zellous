ui.actions = {
  switchChannel(channel) {
    state.currentChannel = channel;
    state.currentChannelId = channel.id;
    state.messages = [];
    if (channel.type === 'text' || channel.type === 'announcement') {
      state.chatMessages = [];
      if (window.chat?.loadHistory) chat.loadHistory(channel.id);
    }
    if (channel.type === 'forum' && window.nostrForum) {
      window.nostrForum.loadChannel(channel.id, state.currentServerId || '');
    }
    if (channel.type === 'voice' && window.lk) {
      if (state.voiceConnected && state.voiceChannelName === channel.name) {
        lk.disconnect();
      } else if (!state.voiceConnected) {
        lk.connect(channel.name)
          .catch((e) => { if (window.ui?.showToast) ui.showToast('Voice connect failed: ' + (e?.message || 'unknown error'), 3000, 'error'); });
      }
    }
    if (window.stateSignals && window.stateSignals.mobileMenuOpen) window.stateSignals.mobileMenuOpen.value = false;
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
  uploadFile() { ui.fileInput?.click(); },
  handleFileSelect(e) {
    const files = e.target.files;
    if (!files?.length) return;
    const onUploadFail = (e) => { if (window.ui?.showToast) ui.showToast('Upload failed: ' + (e?.message || 'unknown error'), 3000, 'error'); };
    for (const file of files) {
      chat.sendImage(file)?.catch?.(onUploadFail);
    }
    e.target.value = '';
  },
  toggleMembers() {
    const sig = window.stateSignals && window.stateSignals.memberListOpen;
    if (sig) sig.value = !sig.value;
  },
  toggleQueue() {},
  toggleSettings() {
    const sig = window.stateSignals && window.stateSignals.settingsOpen;
    if (sig) { sig.value = !sig.value; return; }
    ui.settingsPopover?.classList.toggle('open');
  },
  openMobileMenu() {
    if (window.stateSignals && window.stateSignals.mobileMenuOpen) window.stateSignals.mobileMenuOpen.value = true;
    ui.drawerOverlay?.classList.add('open');
  },
  closeMobileMenu() {
    if (window.stateSignals && window.stateSignals.mobileMenuOpen) window.stateSignals.mobileMenuOpen.value = false;
    ui.drawerOverlay?.classList.remove('open');
  },
  closeVideoPlayback() {
    if (!ui.videoPlayback) return;
    ui.videoPlayback.style.display = 'none';
    if (ui.videoPlaybackVideo) {
      ui.videoPlaybackVideo.pause();
      if (ui.videoPlaybackVideo.src) { URL.revokeObjectURL(ui.videoPlaybackVideo.src); ui.videoPlaybackVideo.src = ''; }
    }
  }
};

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (ui.videoPlayback && ui.videoPlayback.style.display !== 'none') { ui.actions.closeVideoPlayback(); return; }
  // The real settings popover is the SDK's own reactive SettingsPopover
  // (driven by stateSignals.settingsOpen), not the legacy hidden
  // #settingsPopover element -- that element's class never gets toggled
  // through the live code path anymore, so checking it here always read
  // false and Escape silently never closed the real popover.
  if (window.stateSignals?.settingsOpen?.value) { ui.actions.toggleSettings(); return; }
  if (ui.drawerOverlay?.classList.contains('open')) { ui.actions.closeMobileMenu(); return; }
});
