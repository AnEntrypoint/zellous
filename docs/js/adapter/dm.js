export function dmSnapshot(v) {
  const peerName = (pk) => (window.chat && window.chat.resolveProfile(pk)) || pk.slice(0, 8);
  const all = v('dmMessages', []);
  const byPeer = new Map();
  for (const m of all) {
    const e = byPeer.get(m.peer);
    if (!e || m.timestamp > e.timestamp) byPeer.set(m.peer, { peer: m.peer, timestamp: m.timestamp, preview: m.text });
  }
  const active = v('activeDmPeer', null);
  if (active && !byPeer.has(active)) byPeer.set(active, { peer: active, timestamp: Date.now(), preview: '' });
  const conversations = [...byPeer.values()].sort((a, b) => b.timestamp - a.timestamp)
    .map((c) => ({ id: c.peer, name: peerName(c.peer), preview: c.preview, color: (window.getAvatarColor && window.getAvatarColor(c.peer)) || 'var(--accent)' }));
  return {
    conversations,
    currentChannel: { id: 'dm:' + (active || ''), name: active ? peerName(active) : 'Direct messages', type: 'text', topic: active ? '' : 'Pick a conversation or start a new one' },
    messages: active ? all.filter((m) => m.peer === active).map((m) => ({ id: m.id, userId: m.from, timestamp: m.timestamp, content: m.text, type: 'text' })) : [],
  };
}

export function buildDmHome({ v, S, call }) {
  return {
    snapshot: (f) => ({
      dmConversations: f.dm ? f.dm.conversations : [],
      activeDmPeer: f.dm ? v('activeDmPeer', null) : null,
    }),
    actions: {
      newDm: () => call(() => window.channelManager.showNewDmModal()),
      selectDm: (peer) => call(() => { if (S.activeDmPeer) S.activeDmPeer.value = peer; }),
    },
  };
}
