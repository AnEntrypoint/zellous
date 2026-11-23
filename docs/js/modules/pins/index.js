import { registerModule } from '../registry.js';
import { pinsFor } from '../../pins.js';
import { announcementsFor } from '../../announcements.js';

registerModule({
  id: 'pins', kind: 'service',
  setup(ctx) {
    const { v, call, state, hooks } = ctx;

    const startPins = () => { const ch = ctx.currentChannel(); if (ch && ctx.pins) ctx.pins.subscribe(v('currentServerId', null), ch.id); };
    hooks.on('surface:open:pins', startPins);

    const withName = (p) => ({ ...p, name: ctx.nameOf(p.author) });

    return {
      snapshot: () => ({
        announcements: announcementsFor(v('chatMessages', []), state.nostrPubkey).map(withName),
        pins: pinsFor(v('chatMessages', []), state.nostrPubkey, v('channelPins', [])).map(withName),
      }),
      actions: {
        pinMessage: (id) => call(() => {
          const ch = ctx.currentChannel();
          if (!ch || !ctx.pins) return;
          return ctx.pins.pin(v('currentServerId', null), ch.id, id).catch((e) => ctx.toast('Pin failed: ' + ((e && e.message) || 'unknown')));
        }),
      },
    };
  },
});
