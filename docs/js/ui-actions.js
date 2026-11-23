const sig = (name) => window.stateSignals && window.stateSignals[name];

ui.actions = {
  switchChannel(channel) {
    state.currentChannel = channel;
    state.currentChannelId = channel.id;
    state.messages = [];
    window.zModules.openChannel(channel);
    const menu = sig('mobileMenuOpen');
    if (menu) menu.value = false;
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
      document.getElementById('profileAvatar').textContent = window.__zellous.helpers.getInitial(name);
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
  sendFiles(files) {
    const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
    const ch = state.currentChannel;
    if (ch && window.zModules.composerAdminOnly(ch.type) && !(window.serverRoles && window.serverRoles.isAdmin(state.currentServerId))) {
      ui.showToast('Only admins can post in announcement channels', 3000, 'error');
      return;
    }
    for (const file of files || []) {
      if (file.size > MAX_UPLOAD_BYTES) {
        ui.showToast('That file is ' + (Math.round((file.size / 1048576) * 10) / 10) + ' MB — the limit is 20 MB.', 4500, 'error');
        continue;
      }
      chat.sendImage(file);
    }
  },
  handleFileSelect(e) {
    const files = e.target.files;
    if (!files?.length) return;
    this.sendFiles(files);
    e.target.value = '';
  },
  toggleMembers() {
    const members = sig('memberListOpen');
    if (members) members.value = !members.value;
  },
  toggleQueue() {},
  toggleSettings() {
    const settings = sig('settingsOpen');
    if (settings) { settings.value = !settings.value; return; }
    ui.settingsPopover?.classList.toggle('open');
  },
  closeSettings() {
    const settings = sig('settingsOpen');
    if (settings) { settings.value = false; return; }
    ui.settingsPopover?.classList.remove('open');
  },
  openMobileMenu() {
    const menu = sig('mobileMenuOpen');
    if (menu) menu.value = true;
  },
  closeMobileMenu() {
    const menu = sig('mobileMenuOpen');
    if (menu) menu.value = false;
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
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (ui.videoPlayback && ui.videoPlayback.style.display !== 'none') { ui.actions.closeVideoPlayback(); return; }
  if (sig('settingsOpen')?.value) { ui.actions.closeSettings(); return; }
  if (sig('mobileMenuOpen')?.value) { ui.actions.closeMobileMenu(); return; }
});

ui.fileInput?.addEventListener('change', (e) => ui.actions.handleFileSelect(e));

document.addEventListener('dragover', (e) => {
  if (Array.from(e.dataTransfer?.types || []).includes('Files')) e.preventDefault();
});
document.addEventListener('drop', (e) => {
  if (!e.dataTransfer?.files?.length) return;
  window.__zellous.files.handleDrop(e);
});
document.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items || !Array.from(items).some((item) => item.kind === 'file')) return;
  window.__zellous.files.uploadFromClipboard(e);
});
