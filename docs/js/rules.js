export const rulesFor = (channels) => (channels || [])
  .filter((c) => c && c.type === 'page')
  .map((c) => ({ id: c.id, name: c.name || 'rules' }));
