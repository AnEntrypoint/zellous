var nostrMedia = {
  _NIP96_SERVERS: [
    'https://nostr.build/api/v2/nip96/upload',
    'https://void.cat/upload?v=2'
  ],

  async upload(file) {
    var form = new FormData();
    form.append('file', file);
    var errors = [];
    for (var i = 0; i < nostrMedia._NIP96_SERVERS.length; i++) {
      try {
        var res = await fetch(nostrMedia._NIP96_SERVERS[i], { method: 'POST', body: form });
        if (!res.ok) { errors.push(nostrMedia._NIP96_SERVERS[i] + ': ' + res.status); continue; }
        var data = await res.json();
        var url = (data.nip94_event && data.nip94_event.tags && data.nip94_event.tags.find(function(t){return t[0]==='url';})) ?
          data.nip94_event.tags.find(function(t){return t[0]==='url';})[1] :
          data.url || data.location;
        if (url) return { url: url, type: file.type, name: file.name, size: file.size };
      } catch(e) { errors.push(nostrMedia._NIP96_SERVERS[i] + ': ' + e.message); }
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

window.nostrMedia = nostrMedia;
if (!window.__debug) window.__debug = {};
Object.defineProperty(window.__debug, 'media', { get: function() { return { servers: nostrMedia._NIP96_SERVERS }; }, configurable: true });
