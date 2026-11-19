const POLL_RE = /^📊¦([^¦]+)((?:¦[^¦]+){2,5})$/u;

export const pollsFor = (messages) => (messages || []).reduce((list, m) => {
  const text = String((m && (m.content || m.text)) || '');
  const hit = POLL_RE.exec(text);
  if (!hit) return list;
  const options = hit[2].split('¦').slice(1);
  list.push({ id: m.id || text, question: hit[1], options, author: m.userId || '', timestamp: m.timestamp || 0 });
  return list;
}, []).sort((a, b) => b.timestamp - a.timestamp);
