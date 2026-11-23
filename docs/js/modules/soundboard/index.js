import { registerModule } from '../registry.js';
import { SOUNDS } from '../../soundboard.js';

registerModule({
  id: 'soundboard', kind: 'service',
  setup() {
    return { snapshot: () => ({ soundboard: SOUNDS.map(({ id, e, name }) => ({ id, e, name })) }) };
  },
});
