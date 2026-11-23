const PREF_KEY = /^(zellous-pref-[a-z0-9_-]+|zellous-theme|zellous-g3-theme|zellous-muted-channels|zellous-notifications|zellous-message-preview|zellous-sound)$/;

export function makePrefsIO() {
  return {
    read() {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && PREF_KEY.test(k)) out[k] = localStorage.getItem(k);
      }
      return out;
    },
    write(obj) {
      for (const [k, v] of Object.entries(obj || {})) if (PREF_KEY.test(k) && typeof v === 'string') localStorage.setItem(k, v);
      document.dispatchEvent(new CustomEvent('zellous:prefs-synced'));
    }
  };
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('That file is not an image the browser can read'));
  img.src = src;
});

export async function resizeImageFile(file, { size = 192, maxChars = 42000, cover = true } = {}) {
  if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Choose a PNG, JPEG, WebP or GIF image');
  if (file.size > 12 * 1024 * 1024) throw new Error('That image is over 12 MB');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = cover ? size : Math.min(size, img.width);
    const h = cover ? size : Math.round(w * img.height / img.width);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#313338'; ctx.fillRect(0, 0, w, h);
    const scale = cover ? Math.max(w / img.width, h / img.height) : w / img.width;
    const dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    for (const q of [0.86, 0.74, 0.62, 0.5, 0.4, 0.3]) {
      const out = canvas.toDataURL('image/jpeg', q);
      if (out.length <= maxChars) return out;
    }
    throw new Error('That image is too detailed to shrink small enough; try a simpler one');
  } finally { URL.revokeObjectURL(url); }
}

export function generateAvatar(seed) {
  let hash = 2166136261;
  const s = String(seed || 'zellous');
  for (let i = 0; i < s.length; i++) { hash ^= s.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; }
  const rnd = () => { hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0; return hash / 4294967296; };
  const hue = Math.floor(rnd() * 360);
  const bg = 'hsl(' + hue + ',55%,32%)';
  const fg = 'hsl(' + ((hue + 150) % 360) + ',75%,70%)';
  let cells = '';
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
    if (rnd() > 0.5) {
      cells += '<rect x="' + (x * 16 + 8) + '" y="' + (y * 16 + 8) + '" width="16" height="16" fill="' + fg + '"/>';
      if (x < 2) cells += '<rect x="' + ((4 - x) * 16 + 8) + '" y="' + (y * 16 + 8) + '" width="16" height="16" fill="' + fg + '"/>';
    }
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="' + bg + '"/>' + cells + '</svg>';
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

export function installAccount(ww) {
  const acct = ww.account;
  const bump = () => {
    state.accountVersion = (state.accountVersion || 0) + 1;
    state.profilesVersion = (state.profilesVersion || 0) + 1;
    if (window.ui) ui.render.all();
  };
  acct.addEventListener('updated', bump);
  acct.addEventListener('nick', bump);
  ww.pool.addEventListener('relays', bump);
  ww.pool.addEventListener('relay-status', bump);
  ww.mutes.addEventListener('updated', bump);
  let noteTimer = null;
  const note = (key, ok, text) => {
    const at = Date.now();
    state.accountNote = { key, ok, text, at };
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { if (state.accountNote && state.accountNote.at === at) state.accountNote = null; }, 7000);
  };
  const run = async (key, fn, okText) => {
    try {
      const out = await fn();
      note(key, true, typeof okText === 'function' ? okText(out) : okText);
      return out;
    } catch (e) {
      note(key, false, (e && e.message) || 'That did not work');
      return undefined;
    }
  };
  window.nostrAccount = {
    core: acct,
    note,
    run,
    resizeImageFile,
    generateAvatar,
    avatarOf: (pk, sid) => acct.avatarOf(pk, sid),
    allowsDm: (peer, known) => acct.allowsDm(peer, { knownPeers: known }),
    everyonePings: () => acct.everyonePings()
  };
  if (ww.auth.pubkey) acct.load();
}
