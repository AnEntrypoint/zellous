import { registerModule } from '../registry.js';
import { leaderboardFor, levelFor } from '../../xp.js';

registerModule({
  id: 'xp', kind: 'service',
  setup(ctx) {
    const { v, state } = ctx;
    return {
      snapshot: () => ({
        myXp: (state.chatMessages || []).filter((m) => m && m.userId === state.nostrPubkey).length * 10,
        myLevel: levelFor(state.chatMessages || [], state.nostrPubkey || null).level,
        leaderboard: leaderboardFor(v('chatMessages', [])).map((r) => ({ ...r, name: ctx.nameOf(r.id) })),
      }),
      actions: {},
    };
  },
});
