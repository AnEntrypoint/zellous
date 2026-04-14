var nostrMedia = {
  _BLOSSOM_SERVERS: [
    'https://blossom.nostr.build',
    'https://files.sovbit.host',
    'https://nostrcheck.me',
  ],

  async _hashFile(file) {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async _generateBlossomAuth(file, uploadUrl) {
    if (!state.nostrPubkey) throw new Error('Not authenticated');
    const hash = await nostrMedia._hashFile(file);
    const auth_event = {
      kind: 24242,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', 'upload'],
        ['x', hash],
        ['expiration', String(Math.floor(Date.now() / 1000) + 600)],
      ],
      content: 'Upload ' + file.name,
    };
    const signed = await window.auth.sign(auth_event);
    return { header: 'Nostr ' + btoa(JSON.stringify(signed)), hash };
  },

  async _uploadBlossom(file, serverUrl) {
    const uploadUrl = serverUrl + '/upload';
    const { header, hash } = await nostrMedia._generateBlossomAuth(file, uploadUrl);
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Authorization': header,
        'Content-Type': file.type || 'application/octet-stream',
      }
    });
    if (!res.ok) throw new Error('Status ' + res.status);
    const data = await res.json();
    const url = data.url || (data.content && JSON.parse(data.content).url);
    if (!url) throw new Error('No URL in response');
    return url;
  },

  async upload(file) {
    var errors = [];
    for (var i = 0; i < nostrMedia._BLOSSOM_SERVERS.length; i++) {
      try {
        var url = await nostrMedia._uploadBlossom(file, nostrMedia._BLOSSOM_SERVERS[i]);
        return { url: url, type: file.type, name: file.name, size: file.size };
      } catch(e) { errors.push(nostrMedia._BLOSSOM_SERVERS[i] + ': ' + e.message); }
    }
    throw new Error('Upload failed: ' + errors.join('; '));
  },

  isMedia(url) {
    if (!url || typeof url !== 'string') return null;
    var imgRx = /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i;
    var vidRx = /\.(mp4|webm|mov|ogg)(\?|$)/i;
    if (imgRx.test(url)) return 'image';
    if (vidRx.test(url)) return 'video';
    return null;
  },

  extractUrls(text) {
    if (!text) return [];
    var urlRx = /https?:\/\/[^\s<>"]+/g;
    return (text.match(urlRx) || []);
  },

  async sendMedia(file) {
    if (file.size > 20 * 1024 * 1024) throw new Error('File too large (max 20 MB)');
    var result = await nostrMedia.upload(file);
    var chanHex = await _hexChannelId(state.currentChannelId, state.currentServerId);
    var relayHint = (state.nostrRelays || [])[0] || '';
    var imetaTag = ['imeta', 'url ' + result.url, 'm ' + result.type];
    if (result.size) imetaTag.push('size ' + result.size);
    var template = {
      kind: 42,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['e', chanHex, relayHint, 'root'], imetaTag],
      content: result.url
    };
    var signed = await auth.sign(template);
    nostrNet.publish(signed);
    chat._addMessage(chat._eventToMsg(signed));
  }
};

window.__zellous.media = nostrMedia;
window.nostrMedia = nostrMedia;
if (!window.__debug) window.__debug = {};
Object.defineProperty(window.__debug, 'media', { get: function() { return { servers: nostrMedia._NIP96_SERVERS }; }, configurable: true });
