const READ_KEY = 'zellous-dm-read';

const readMap = () => { try { return JSON.parse(localStorage.getItem(READ_KEY) || '{}'); } catch (_) { return {}; } };

const markRead = (peer, bump) => {
  if (!peer) return;
  const map = readMap();
  map[peer] = Date.now();
  try { localStorage.setItem(READ_KEY, JSON.stringify(map)); } catch (_) {}
  bump();
};

export function dmSnapshot(v) {
  const peerName = (pk) => (window.chat && window.chat.resolveProfile(pk)) || pk.slice(0, 8);
  const all = v('dmMessages', []);
  const byPeer = new Map();
  for (const m of all) {
    const e = byPeer.get(m.peer);
    if (!e || m.timestamp > e.timestamp) byPeer.set(m.peer, { peer: m.peer, timestamp: m.timestamp, preview: m.text, unread: 0 });
  }
  v('dmReadVersion', 0);
  const readAt = readMap();
  const active0 = v('activeDmPeer', null);
  for (const m of all) {
    const e = byPeer.get(m.peer);
    if (e && !m.mine && m.peer !== active0 && m.timestamp > (readAt[m.peer] || 0)) e.unread += 1;
  }
  const active = v('activeDmPeer', null);
  if (active && !byPeer.has(active)) byPeer.set(active, { peer: active, timestamp: Date.now(), preview: '' });
  const conversations = [...byPeer.values()].sort((a, b) => b.timestamp - a.timestamp)
    .map((c) => ({ id: c.peer, name: peerName(c.peer), preview: c.preview, unread: c.unread || 0, status: window.nostrPresence ? window.nostrPresence.statusOf(c.peer).status : 'online', color: (window.getAvatarColor && window.getAvatarColor(c.peer)) || 'var(--accent)' }));
  return {
    conversations,
    currentChannel: { id: 'dm:' + (active || ''), name: active ? peerName(active) : 'Direct messages', type: 'text', topic: active ? '' : 'Pick a conversation or start a new one' },
    messages: active ? markSeen(all.filter((m) => m.peer === active).map((m) => ({ id: m.id, userId: m.from, timestamp: m.timestamp, content: m.text, type: 'text', mine: !!m.mine, ...(m.send ? { send: m.send } : {}) })), active) : [],
  };
}

function markSeen(list, peer) {
  if (!window.nostrAccount || !window.nostrAccount.receiptsOn() || !window.dm) return list;
  const upTo = window.dm.seenUpTo(peer);
  let last = -1;
  list.forEach((m, i) => { if (m.mine && m.timestamp <= upTo) last = i; });
  return last < 0 ? list : list.map((m, i) => (i === last ? { ...m, seen: true } : m));
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
        status: p.status,
        activity: p.custom ? '💬 ' + p.custom : 'Playing ' + (((window.state && window.state.servers) || []).find((x) => x && x.id === (window.state && window.state.currentServerId)) || {}).name || 'Zellous',
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
      selectDm: (peer) => call(() => {
        const bump = () => { if (S.dmReadVersion) S.dmReadVersion.value += 1; };
        markRead(v('activeDmPeer', null), () => {});
        markRead(peer, bump);
        if (S.activeDmPeer) S.activeDmPeer.value = peer;
        setTimeout(() => window.dm && window.dm.maybeSendReceipt(), 300);
      }),
    },
  };
}
