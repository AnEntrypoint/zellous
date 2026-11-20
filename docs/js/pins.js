export const pinsFor = (messages, me, ids) => {
  const byId = new Map((messages || []).filter(Boolean).map((m) => [m.id, m]));
  return (ids || [])
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((m) => ({ id: m.id, author: m.userId, content: String(m.content || ''), timestamp: m.timestamp || 0, mine: m.userId === me }));
};
