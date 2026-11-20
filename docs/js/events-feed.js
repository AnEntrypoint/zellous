const EVENT_KIND = 31923;
const RSVP_KIND = 31925;
const DELETE_KIND = 5;

const channelTag = async (channelId, serverId) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode((serverId || 'default') + ':' + channelId));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

const tagValue = (ev, key) => ((ev.tags || []).find((t) => t[0] === key) || [])[1] || '';

export async function subscribeChannelEvents(channelId, serverId, onList) {
  const net = window.nostrNet;
  if (!net || !channelId) { onList([]); return () => {}; }
  const tag = await channelTag(channelId, serverId);
  const creator = serverId ? String(serverId).split(':')[0] : null;
  const events = new Map();
  const rsvps = new Map();
  const deleted = new Map();
  const emit = () => {
    const list = [];
    for (const e of events.values()) {
      const deleter = deleted.get(e.id);
      if (deleter && (deleter === e.author || deleter === creator)) continue;
      const votes = rsvps.get(e.addr) || new Map();
      const going = [...votes.entries()].filter(([, v]) => v.status === 'accepted').map(([pk]) => pk);
      if (!votes.has(e.author)) going.unshift(e.author);
      list.push({ ...e, going });
    }
    onList(list.sort((a, b) => a.start - b.start));
  };
  const evSub = 'events-' + channelId;
  const rsvpSub = 'events-rsvp-' + channelId;
  const delSub = 'events-del-' + channelId;
  net.subscribe(evSub, [{ kinds: [EVENT_KIND], '#e': [tag], limit: 100 }],
    (ev) => {
      if (!(ev.tags || []).some((t) => t[0] === 'e' && t[1] === tag)) return;
      const start = Number(tagValue(ev, 'start'));
      if (!start) return;
      const end = Number(tagValue(ev, 'end'));
      events.set(ev.id, {
        id: ev.id,
        addr: EVENT_KIND + ':' + ev.pubkey + ':' + tagValue(ev, 'd'),
        title: tagValue(ev, 'title') || 'Untitled event',
        start: start * 1000,
        end: end ? end * 1000 : null,
        location: tagValue(ev, 'location'),
        about: ev.content || '',
        author: ev.pubkey
      });
      emit();
    },
    () => emit());
  net.subscribe(rsvpSub, [{ kinds: [RSVP_KIND], limit: 500 }],
    (ev) => {
      const addr = tagValue(ev, 'a');
      if (!addr) return;
      const votes = rsvps.get(addr) || new Map();
      const prev = votes.get(ev.pubkey);
      if (prev && prev.ts > ev.created_at) return;
      votes.set(ev.pubkey, { status: tagValue(ev, 'status'), ts: ev.created_at });
      rsvps.set(addr, votes);
      emit();
    },
    () => emit());
  net.subscribe(delSub, [{ kinds: [DELETE_KIND], limit: 500 }],
    (ev) => {
      for (const t of ev.tags || []) if (t[0] === 'e' && t[1]) deleted.set(t[1], ev.pubkey);
      emit();
    },
    () => emit());
  return () => { net.unsubscribe(evSub); net.unsubscribe(rsvpSub); net.unsubscribe(delSub); };
}
