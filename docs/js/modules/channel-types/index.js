import { registerModule, getContext } from '../registry.js';

registerModule({
  id: 'type-text', kind: 'channelType',
  channelType: { type: 'text', label: 'Text', searchGlyph: '#', createOption: { label: 'Text', order: 1 }, traits: { inRail: true, history: true, composer: 'standard', split: true, defaultOpen: true, members: true } },
});

registerModule({
  id: 'type-announcement', kind: 'channelType',
  channelType: { type: 'announcement', label: 'Announcement', searchGlyph: '#', createOption: { label: 'Announcement', order: 4 }, traits: { inRail: true, history: true, composer: 'admin', split: true, members: true } },
});

registerModule({
  id: 'type-voice', kind: 'channelType',
  channelType: {
    type: 'voice', label: 'Voice', searchGlyph: 'voice', createOption: { label: 'Voice', order: 2 }, traits: { inRail: true, voice: true, members: false },
    onOpen(channel, ctx) {
      if (!ctx.voice) return;
      if (ctx.state.voiceConnected && ctx.state.voiceChannelName === channel.name) ctx.voice.disconnect();
      else if (!ctx.state.voiceConnected) ctx.voice.connect(channel.name).catch((e) => ctx.toast('Voice connect failed: ' + ((e && e.message) || 'unknown error')));
    },
  },
});

registerModule({
  id: 'type-threaded', kind: 'channelType',
  channelType: { type: 'threaded', label: 'Threaded', createOption: { label: 'Threaded', order: 3 }, traits: { threadParent: true, members: true } },
});

registerModule({
  id: 'type-forum', kind: 'channelType',
  channelType: {
    type: 'forum', label: 'Forum', traits: { forumPosts: true, members: true },
    onOpen(channel, ctx) { if (ctx.forum) ctx.forum.loadChannel(channel.id, ctx.state.currentServerId); },
  },
  snapshot: (deps, f) => {
    const ctx = getContext();
    const forum = ctx && ctx.forum;
    return { forumPosts: f.curr && f.curr.type === 'forum' && forum ? forum.listFor(f.curr.id).map((p) => ({ ...p, author: ctx.chat && ctx.chat.resolveProfile ? ctx.chat.resolveProfile(p.author) : p.author })) : [] };
  },
});

registerModule({
  id: 'type-page', kind: 'channelType',
  channelType: { type: 'page', label: 'Page', traits: { inRail: true, pageData: true, members: true } },
});
