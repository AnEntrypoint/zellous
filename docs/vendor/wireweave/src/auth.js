const b2hex = (bytes) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
const hex2b = (hex) => {
  const a = new Uint8Array(hex.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return a;
};

export class NostrAuth extends EventTarget {
  constructor({ nostrTools, storage = null, extension = null } = {}) {
    super();
    if (!nostrTools) throw new Error('nostrTools required');
    this.NT = nostrTools;
    this.storage = storage;
    this.extension = extension;
    this.pubkey = '';
    this.privkey = null;
    this.profile = null;
  }

  loadFromStorage() {
    if (!this.storage) return false;
    const skHex = this.storage.getItem('zn_sk');
    const pkHex = this.storage.getItem('zn_pk');
    if (!skHex || !pkHex) return false;
    try {
      this.privkey = hex2b(skHex);
      this.pubkey = pkHex;
      this._emit('login', { pubkey: pkHex });
      return true;
    } catch { return false; }
  }

  generateKey() {
    const sk = this.NT.generateSecretKey();
    const pk = this.NT.getPublicKey(sk);
    this._persist(sk, pk);
    this._emit('login', { pubkey: pk });
    return { pubkey: pk, privkey: sk };
  }

  importKey(input) {
    const sk = input.startsWith('nsec')
      ? (() => { const d = this.NT.nip19.decode(input); if (d.type !== 'nsec') throw new Error('not nsec'); return d.data; })()
      : hex2b(input);
    const pk = this.NT.getPublicKey(sk);
    this._persist(sk, pk);
    this._emit('login', { pubkey: pk });
    return { pubkey: pk, privkey: sk };
  }

  async loginWithExtension() {
    if (!this.extension) throw new Error('No extension provided');
    const pk = await this.extension.getPublicKey();
    this.pubkey = pk;
    this.privkey = null;
    this._emit('login', { pubkey: pk });
    return pk;
  }

  async sign(eventTemplate) {
    if (this.privkey) return this.NT.finalizeEvent(eventTemplate, this.privkey);
    if (this.extension) return this.extension.signEvent(eventTemplate);
    throw new Error('No signing key available');
  }

  logout() {
    this.storage?.removeItem('zn_sk');
    this.storage?.removeItem('zn_pk');
    this.pubkey = '';
    this.privkey = null;
    this.profile = null;
    this._emit('logout', {});
  }

  isLoggedIn() { return !!this.pubkey; }

  npubShort(pubkey = this.pubkey) {
    if (!pubkey) return '';
    const npub = this.NT.nip19.npubEncode(pubkey);
    return npub.slice(0, 8) + '...' + npub.slice(-4);
  }

  npubEncode(pubkey = this.pubkey) {
    return pubkey ? this.NT.nip19.npubEncode(pubkey) : '';
  }

  _persist(sk, pk) {
    this.privkey = sk;
    this.pubkey = pk;
    this.storage?.setItem('zn_sk', b2hex(sk));
    this.storage?.setItem('zn_pk', pk);
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}

export const createAuth = (opts) => new NostrAuth(opts);
