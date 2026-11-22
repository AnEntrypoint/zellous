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

function peopleHere(v) {
  v('presenceVersion', 0);
  v('profilesVersion', 0);
  const st = window.state || {};
  return (st.roomMembers || [])
    .filter((m) => m.id !== st.nostrPubkey)
    .map((m) => {
      const p = window.nostrPresence ? window.nostrPresence.statusOf(m.id) : { status: 'online', custom: '' };
      return {
        id: m.id,
        name: (window.chat && window.chat.resolveProfile(m.id)) || m.username || m.id.slice(0, 8),
        color: (window.getAvatarColor && window.getAvatarColor(m.id)) || 'var(--accent)',
        status: p.status,
        activity: p.custom || 'Zellous',
      };
    })
    .filter((p) => p.status !== 'invisible');
}

export function buildDmHome({ v, S, call }) {
  return {
    snapshot: (f) => ({
      dmConversations: f.dm ? f.dm.conversations : [],
      peopleHere: peopleHere(v),
      activeDmPeer: f.dm ? v('activeDmPeer', null) : null,
    }),
    actions: {
      newDm: () => call(() => window.channelManager.showNewDmModal()),
      selectDm: (peer) => call(() => { if (S.activeDmPeer) S.activeDmPeer.value = peer; }),
    },
  };
}
