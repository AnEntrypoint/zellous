import { registerModule } from '../registry.js';

registerModule({
  id: 'share-web',
  kind: 'service',
  setup(ctx) {
    const proto = ctx.ww.modules.protocolFor('page-share');
    const share = proto.createPageShare({ relayPool: ctx.ww.pool, auth: ctx.ww.auth });
    const page = ctx.signal('page', null);
    const dialog = ctx.signal('dialog', false);
    const hidden = ctx.signal('hidden', false);
    const screen = ctx.signal('screen', false);
    const videos = ctx.signal('videos', []);
    let watched = null;

    const voiceChannel = () => {
      const name = ctx.state.voiceChannelName;
      if (!ctx.state.voiceConnected || !name) return null;
      return (ctx.state.channels || []).find((c) => c.name === name && ctx.trait(c.type, 'inRail') && (c.type === 'voice' || c.type === 'voice-thread')) || null;
    };

    const refresh = () => {
      const channel = voiceChannel();
      const serverId = ctx.state.currentServerId;
      const current = channel && serverId ? share.current(serverId, channel.id) : null;
      if (current && current.url) {
        const me = ctx.ww.auth.pubkey;
        page.value = { url: current.url, by: current.by, byName: ctx.chat && ctx.chat.resolveProfile ? ctx.chat.resolveProfile(current.by) : current.by.slice(0, 8), mine: current.by === me };
      } else if (page.value) { page.value = null; hidden.value = false; }
      const session = ctx.voice && ctx.voice.session ? ctx.voice.session() : null;
      screen.value = !!(session && session.screenSharing);
      const keys = Object.keys(ctx.state.voiceVideos || {});
      if (keys.join() !== videos.value.join()) videos.value = keys;
    };

    share.onChange(refresh);
    setInterval(() => {
      const channel = voiceChannel();
      const serverId = ctx.state.currentServerId;
      const key = channel && serverId ? serverId + '|' + channel.id : null;
      if (key !== watched) {
        if (watched) { const [s, c] = watched.split('|'); share.unwatch(s, c); }
        watched = key;
        if (key) share.watch(serverId, channel.id);
      }
      refresh();
    }, 700);

    new MutationObserver(() => {
      for (const el of document.querySelectorAll('[data-video-peer]')) {
        const stream = (ctx.state.voiceVideos || {})[el.dataset.videoPeer];
        if (stream && el.srcObject !== stream) el.srcObject = stream;
      }
    }).observe(document.body, { childList: true, subtree: true });

    return {
      snapshot: () => ({ shareWeb: { inVoice: !!voiceChannel(), page: page.value, dialog: dialog.value, hidden: hidden.value, screen: screen.value, videos: videos.value } }),
      actions: {
        sharePageOpen: () => { dialog.value = true; },
        sharePageClose: () => { dialog.value = false; },
        sharePageStart: (url) => ctx.guard(async () => {
          const channel = voiceChannel();
          if (!channel) throw new Error('Join a voice room or voice thread first');
          const current = share.current(ctx.state.currentServerId, channel.id);
          if (current && current.url && current.by !== ctx.ww.auth.pubkey) throw new Error('Someone else is already sharing a page in this room');
          await share.start(ctx.state.currentServerId, channel.id, url);
          hidden.value = false;
          dialog.value = false;
        }),
        sharePageStop: () => ctx.guard(async () => { const channel = voiceChannel(); if (channel) await share.stop(ctx.state.currentServerId, channel.id); }),
        sharePageHide: (on) => { hidden.value = !!on; },
        shareScreenToggle: () => ctx.guard(async () => {
          if (!voiceChannel()) throw new Error('Join a voice room or voice thread first');
          await ctx.voice.setScreen(!screen.value);
          refresh();
        }),
      },
    };
  },
});
