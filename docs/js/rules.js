import { trait } from './modules/registry.js';

export const rulesFor = (channels) => (channels || [])
  .filter((c) => c && trait(c.type, 'pageData'))
  .map((c) => ({ id: c.id, name: c.name || 'rules' }));
