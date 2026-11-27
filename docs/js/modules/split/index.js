import { registerModule } from '../registry.js';
import { subscribeSplitMessages } from '../../split-feed.js';

registerModule({
  id: 'split', kind: 'service',
  setup(ctx) {
    const { S, v, call, hooks } = ctx;
    let stopSplit = null;

    const stopSplitFeed = () => { if (stopSplit) stopSplit(); stopSplit = null; };
    const setSplit = (other) => {
      stopSplitFeed();
      if (S.splitChannel) S.splitChannel.value = other || null;
      if (S.splitMessages) S.splitMessages.value = [];
      if (!other) return;
      subscribeSplitMessages(other.id, v('currentServerId', null), (list) => { if (S.splitMessages) S.splitMessages.value = list; }).then((stop) => { stopSplit = stop; });
    };
    hooks.on('surface:close', stopSplitFeed);

    return {
      snapshot: () => ({
        splitChannel: v('splitChannel', null),
        splitOptions: (() => { const cur = v('currentChannel', null); return (v('channels', []) || []).filter((c) => c && ctx.trait(c.type, 'split') && !(cur && c.id === cur.id)).map((c) => ({ id: c.id, name: c.name })); })(),
        splitMessages: (v('splitMessages', []) || []).slice().reverse().map((m) => ({ ...m, time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !v('pref_h24', false) }), name: ctx.nameOf(m.userId) })),
      }),
      actions: {
        splitTo: (id) => call(() => setSplit(id ? (v('channels', []) || []).find((c) => c && c.id === id) : null)),
        splitSend: (text) => call(() => { const sp = v('splitChannel', null); if (sp) return ctx.chat.sendTo(v('currentServerId', null), sp.id, text); }),
        splitMain: () => call(() => { const sp = v('splitChannel', null); if (sp) ctx.goToChannel(sp.name); }),
      },
    };
  },
});
