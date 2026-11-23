import { registerModule } from '../registry.js';
import { pollsFor } from '../../polls.js';

registerModule({
  id: 'polls', kind: 'service',
  setup(ctx) {
    const { v, call } = ctx;
    return {
      snapshot: () => ({
        polls: pollsFor(v('chatMessages', [])).map((p) => {
          const tally = ctx.polls ? ctx.polls.tally(p.id, p.options.length) : { counts: p.options.map(() => 0), total: 0, mine: -1 };
          v('pollVotesVersion', 0);
          return { ...p, ...tally, name: ctx.nameOf(p.author, '') };
        }),
      }),
      actions: {
        votePoll: (id, i) => call(() => {
          const p = pollsFor(v('chatMessages', [])).find((x) => x.id === id);
          if (!p || !ctx.polls) return;
          return ctx.polls.vote(id, i, p.options.length).catch((e) => ctx.toast('Vote failed: ' + ((e && e.message) || 'unknown')));
        }),
      },
    };
  },
});
