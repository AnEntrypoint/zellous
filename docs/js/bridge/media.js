export function installMedia(ww) {
  const media = ww.media;
  window.nostrMedia = {
    upload: (f) => media.upload(f),
    isMedia: (u) => media.isMedia(u),
    extractUrls: (t) => media.extractUrls(t),
    async sendMedia(file) {
      const r = await media.sendMedia(file, { channelId: state.currentChannelId, serverId: state.currentServerId || '' });
      window.chat && window.chat.handleTextMessage && window.chat.handleTextMessage({ id: r.signed.id, type: 'text', userId: r.signed.pubkey, content: r.signed.content, timestamp: r.signed.created_at * 1000, tags: [], media: { url: r.result.url, mime: r.result.type || '', size: r.result.size || null } });
      return r;
    }
  };
}
