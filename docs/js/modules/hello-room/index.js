import { registerModule } from '../registry.js';

registerModule({
  id: 'hello-room', kind: 'channelType',
  channelType: { type: 'hello-room', label: 'Hello room', searchGlyph: '#', createOption: { label: 'Hello room', order: 5 }, traits: { inRail: true, history: true, composer: 'standard', split: true, members: true } },
});
