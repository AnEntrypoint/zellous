export const recapFor = (messages, me, unread) => {
  const missed = Math.max(0, unread | 0);
  if (!missed) return [];
  return (messages || []).filter((m) => m && m.userId && m.userId !== me)
    .slice(-missed).reverse()
    .map((m) => ({ id: m.id || m.userId + ':' + (m.timestamp || 0), author: m.userId, content: String(m.content || m.text || ''), timestamp: m.timestamp || 0 }));
};
