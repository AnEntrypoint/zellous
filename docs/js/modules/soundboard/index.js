import { registerModule } from '../registry.js';
import { SOUNDS, playSoundboard } from '../../soundboard.js';

registerModule({
  id: 'soundboard', kind: 'service',
  setup(ctx) {
    const { v, call } = ctx;
    return {
      snapshot: () => ({ soundboard: SOUNDS.map(({ id, e, name }) => ({ id, e, name })) }),
      actions: { playSound: (id) => call(() => playSoundboard(id, () => !!v('pref_sbsounds', true))) },
    };
  },
});
