export function installAuth(ww) {
  const net = ww.pool;
  const chat = ww.chat;
  // Auth bridge
  const a = ww.auth;
  a.loadFromStorage();
  a.addEventListener('storage-error', (e) => { if (window.ui) ui.showToast(e.detail.message || 'Storage error', 4000, 'error'); });
  a.addEventListener('persist-failed', () => { if (window.ui) ui.showToast('Could not save your login key — storage is full. Free up space or your session won\'t persist after reload.', 6000, 'error'); });
  // Both "generate" entry points (the legacy #generateKeyBtn and the SDK
  // AuthModal's onGenerate -> adapter authGenerate) discard the current key
  // with no confirmation, so the guard and the post-generate backup prompt
  // live here once and both call it.
  const generateKeyWithConfirm = async () => {
    const yes = await window.ui.confirm({
      title: 'Replace your current identity?',
      message: 'Your current key is discarded and cannot be recovered. Anything already posted under it stays on relays, but you will never be able to sign in as it again.',
      confirmLabel: 'Replace key', danger: true,
    });
    if (!yes) return false;
    window.auth.generateKey();
    window.auth._afterLogin();
    if (window.channelManager && window.channelManager.showKeyBackupModal) window.channelManager.showKeyBackupModal();
    return true;
  };

  window.auth = {
    get user() {
      const pk = a.pubkey; if (!pk) return null;
      const short = a.npubShort(pk);
      return { id: pk, username: short, displayName: state.nostrProfile?.name || short };
    },
    init() {
      if (!a.pubkey) return false;
      state.nostrPrivkey = a.privkey; state.nostrPubkey = a.pubkey;
      const short = a.npubShort(a.pubkey);
      const nameEl = document.getElementById('userPanelName'); if (nameEl) nameEl.textContent = short;
      const tagEl = document.getElementById('userPanelTag'); if (tagEl) tagEl.textContent = short;
      const avatarEl = document.getElementById('userPanelAvatar');
      if (avatarEl) { const n = avatarEl.childNodes[0]; if (n?.nodeType === 3) n.textContent = short[0].toUpperCase(); }
      document.getElementById('userStatusDot')?.classList.add('online');
      return true;
    },
    generateKey() { const r = a.generateKey(); state.nostrPrivkey = r.privkey; state.nostrPubkey = r.pubkey; state.authVersion = (state.authVersion || 0) + 1; return r; },
    importKey(input) { try { const r = a.importKey(input); state.nostrPrivkey = r.privkey; state.nostrPubkey = r.pubkey; state.authVersion = (state.authVersion || 0) + 1; return true; } catch { return false; } },
    async loginWithExtension() { const pk = await a.loginWithExtension(); state.nostrPubkey = pk; state.nostrPrivkey = null; state.authVersion = (state.authVersion || 0) + 1; return pk; },
    sign: (t) => a.sign(t),
    async setDisplayName(name) {
      if (!a.pubkey) throw new Error('Not logged in');
      if (!name?.trim()) throw new Error('Invalid display name');
      const signed = await a.sign({ kind: 0, created_at: Math.floor(Date.now() / 1000), tags: [], content: JSON.stringify({ ...(state.nostrProfile || {}), name: name.trim() }) });
      net.publish(signed);
      state.nostrProfile = { ...(state.nostrProfile || {}), name: name.trim() };
      const nameEl = document.getElementById('userPanelName'); if (nameEl) nameEl.textContent = state.nostrProfile.name;
      const avatarEl = document.getElementById('userPanelAvatar');
      if (avatarEl) { const n = avatarEl.childNodes[0]; if (n?.nodeType === 3) n.textContent = state.nostrProfile.name[0].toUpperCase(); }
      if (window.chat) chat.updateProfile(a.pubkey, state.nostrProfile);
    },
    logout() { a.logout(); state.nostrPubkey = ''; state.nostrPrivkey = null; state.nostrProfile = null; state.authVersion = (state.authVersion || 0) + 1; net.disconnect(); window.dm.reset(); },
    getToken: () => a.pubkey || null,
    isLoggedIn: () => a.isLoggedIn(),
    npubShort: (pk) => a.npubShort(pk),
    nsecEncode: () => a.nsecEncode(),
    showModal() {
      const modal = document.getElementById('authModal'); if (!modal) return;
      modal.style.display = 'flex';
      const cv = document.getElementById('nostrConnectView'); const lv = document.getElementById('nostrLoggedInView');
      const loggedIn = a.isLoggedIn();
      if (cv) cv.style.display = loggedIn ? 'none' : 'flex';
      if (lv) lv.style.display = loggedIn ? 'flex' : 'none';
      if (loggedIn) {
        const d = document.getElementById('nostrNpubDisplay'); if (d) d.textContent = a.npubShort();
        const inp = document.getElementById('displayNameInput'); if (inp) inp.value = state.nostrProfile?.name || '';
      }
      if (typeof _a11yPersistentModal === 'function') _a11yPersistentModal(modal, () => window.auth.hideModal());
    },
    hideModal() {
      const modal = document.getElementById('authModal'); if (!modal) return;
      modal.style.display = 'none';
      modal._a11yRestoreFocus && modal._a11yRestoreFocus();
    },
    _afterLogin() {
      const d = document.getElementById('nostrNpubDisplay'); if (d) d.textContent = a.npubShort();
      const cv = document.getElementById('nostrConnectView'); const lv = document.getElementById('nostrLoggedInView');
      if (cv) cv.style.display = 'none'; if (lv) lv.style.display = 'flex';
      const err = document.getElementById('nostrAuthError'); if (err) err.textContent = '';
      const short = a.npubShort();
      const nameEl = document.getElementById('userPanelName');
      const tagEl = document.getElementById('userPanelTag');
      const avatarEl = document.getElementById('userPanelAvatar');
      if (nameEl) nameEl.textContent = state.nostrProfile?.name || short;
      if (tagEl) tagEl.textContent = short;
      if (avatarEl) { const n = avatarEl.childNodes[0]; if (n?.nodeType === 3) n.textContent = (state.nostrProfile?.name || short)[0].toUpperCase(); }
      document.getElementById('userStatusDot')?.classList.add('online');
      document.dispatchEvent(new CustomEvent('nostr:login'));
      setTimeout(() => window.auth.hideModal(), 1000);
    },
    _err(msg) { const el = document.getElementById('nostrAuthError'); if (el) el.textContent = msg; },
    bindUI() {
      const $ = id => document.getElementById(id);
      const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
      on('connectExtensionBtn', async () => { try { if (!window.nostr) throw new Error('No Nostr extension found'); await window.auth.loginWithExtension(); window.auth._afterLogin(); } catch (e) { window.auth._err(e.message); } });
      on('generateKeyBtn', () => { generateKeyWithConfirm().catch((e) => window.auth._err(e.message)); });
      on('importKeyBtn', () => { const inp = $('importKeyInput'); const val = inp ? inp.value.trim() : ''; if (!val) { window.auth._err('Enter a key'); return; } window.auth.importKey(val) ? window.auth._afterLogin() : window.auth._err('Invalid key'); });
      on('copyNpubBtn', () => { const pk = a.pubkey; if (pk) navigator.clipboard.writeText(a.npubEncode(pk)).catch(() => {}); });
      on('saveDisplayNameBtn', async () => { const inp = $('displayNameInput'); const val = inp ? inp.value.trim() : ''; if (!val) { window.auth._err('Enter a display name'); return; } try { await window.auth.setDisplayName(val); } catch (e) { window.auth._err(e.message); } });
      on('nostrLogoutBtn', () => { window.auth.logout(); window.auth.showModal(); });
      const modal = document.getElementById('authModal');
      if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) window.auth.hideModal(); });
      const av = document.querySelector('.user-avatar, .username-area, [data-action="show-auth"]');
      if (av) av.addEventListener('click', () => window.auth.showModal());
    }
  };

  return { generateKeyWithConfirm };
}
