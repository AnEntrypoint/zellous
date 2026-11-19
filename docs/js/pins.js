export const pinsFor = (messages, me) => (messages || [])
  .filter((m) => m && Array.isArray(m.tags) && m.tags.includes('pinned'))
  .slice().reverse()
  .map((m) => ({ id: m.id || m.userId + ':' + (m.timestamp || 0), author: m.userId, content: String(m.content || ''), timestamp: m.timestamp || 0, mine: m.userId === me }));
