const auth = {
  get user() {
    const pk = state.nostrPubkey;
    if (!pk) return null;
    const short = auth.npubShort(pk);
    return { id: pk, username: short, displayName: state.nostrProfile?.name || short };
  },

  init() {
    const skHex = localStorage.getItem('zn_sk');
    const pkHex = localStorage.getItem('zn_pk');
    if (!skHex || !pkHex) return false;
    try {
      state.nostrPrivkey = auth._hex2b(skHex);
      state.nostrPubkey = pkHex;
      return true;
    } catch { return false; }
  },

  generateKey() {
    const NT = window.NostrTools;
    const sk = NT.generateSecretKey();
    const pk = NT.getPublicKey(sk);
    localStorage.setItem('zn_sk', auth._b2hex(sk));
    localStorage.setItem('zn_pk', pk);
    state.nostrPrivkey = sk;
    state.nostrPubkey = pk;
    return { pubkey: pk, privkey: sk };
  },

  importKey(input) {
    try {
      const NT = window.NostrTools;
      const sk = input.startsWith('nsec')
        ? (() => { const d = NT.nip19.decode(input); if (d.type !== 'nsec') throw 0; return d.data; })()
        : auth._hex2b(input);
      const pk = NT.getPublicKey(sk);
      localStorage.setItem('zn_sk', auth._b2hex(sk));
      localStorage.setItem('zn_pk', pk);
      state.nostrPrivkey = sk;
      state.nostrPubkey = pk;
      return true;
    } catch { return false; }
  },

  async loginWithExtension() {
    const pk = await window.nostr.getPublicKey();
    state.nostrPubkey = pk;
    state.nostrPrivkey = null;
    return pk;
  },

  async sign(eventTemplate) {
    if (state.nostrPrivkey) return window.NostrTools.finalizeEvent(eventTemplate, state.nostrPrivkey);
    return window.nostr.signEvent(eventTemplate);
  },

  logout() {
    localStorage.removeItem('zn_sk');
    localStorage.removeItem('zn_pk');
    state.nostrPubkey = '';
    state.nostrPrivkey = null;
    state.nostrProfile = null;
    if (window.nostrNet?.disconnect) nostrNet.disconnect();
  },

  getToken() { return state.nostrPubkey || null; },
  isLoggedIn() { return !!state.nostrPubkey; },

  npubShort(pubkey) {
    if (!pubkey) return '';
    const npub = window.NostrTools.nip19.npubEncode(pubkey);
    return npub.slice(0, 8) + '...' + npub.slice(-4);
  },

  showModal() {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.style.display = 'flex';
    const cv = document.getElementById('nostrConnectView');
    const lv = document.getElementById('nostrLoggedInView');
    const loggedIn = auth.isLoggedIn();
    if (cv) cv.style.display = loggedIn ? 'none' : 'flex';
    if (lv) lv.style.display = loggedIn ? 'flex' : 'none';
    if (loggedIn) {
      const d = document.getElementById('nostrNpubDisplay');
      if (d) d.textContent = auth.npubShort(state.nostrPubkey);
    }
  },

  hideModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
  },

  _afterLogin() {
    const d = document.getElementById('nostrNpubDisplay');
    if (d) d.textContent = auth.npubShort(state.nostrPubkey);
    const cv = document.getElementById('nostrConnectView');
    const lv = document.getElementById('nostrLoggedInView');
    if (cv) cv.style.display = 'none';
    if (lv) lv.style.display = 'flex';
    const err = document.getElementById('nostrAuthError');
    if (err) err.textContent = '';
    setTimeout(() => auth.hideModal(), 1000);
  },

  _err(msg) {
    const el = document.getElementById('nostrAuthError');
    if (el) el.textContent = msg;
  },

  bindUI() {
    const $ = id => document.getElementById(id);
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };

    on('connectExtensionBtn', async () => {
      try {
        if (!window.nostr) throw new Error('No Nostr extension found');
        await auth.loginWithExtension();
        auth._afterLogin();
      } catch (e) { auth._err(e.message); }
    });

    on('generateKeyBtn', () => {
      try { auth.generateKey(); auth._afterLogin(); }
      catch (e) { auth._err(e.message); }
    });

    on('importKeyBtn', () => {
      const inp = $('importKeyInput');
      const val = inp ? inp.value.trim() : '';
      if (!val) { auth._err('Enter a key'); return; }
      auth.importKey(val) ? auth._afterLogin() : auth._err('Invalid key');
    });

    on('copyNpubBtn', () => {
      const pk = state.nostrPubkey;
      if (pk) navigator.clipboard.writeText(window.NostrTools.nip19.npubEncode(pk)).catch(() => {});
    });

    on('nostrLogoutBtn', () => { auth.logout(); auth.showModal(); });

    const avatarArea = document.querySelector('.user-avatar, .username-area, [data-action="show-auth"]');
    if (avatarArea) avatarArea.addEventListener('click', () => auth.showModal());
  },

  _b2hex(bytes) { return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''); },
  _hex2b(hex) {
    const a = new Uint8Array(hex.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return a;
  }
};

auth.init();
window.auth = auth;
