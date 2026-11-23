import { registerModule } from '../registry.js';

registerModule({
  id: 'presence', kind: 'service',
  setup(ctx) {
    const { v, call, state } = ctx;
    const own = () => { v('presenceVersion', 0); return ctx.presence && state.nostrPubkey ? ctx.presence.statusOf(state.nostrPubkey) : null; };

    return {
      snapshot: () => ({
        presenceStatus: (own() || { status: 'online' }).status,
        presenceCustom: (own() || { custom: '' }).custom,
      }),
      actions: {
        setPresence: (status, custom) => call(() => ctx.presence && ctx.presence.set(status, custom)),
      },
    };
  },
});
