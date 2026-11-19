const EVENT_KIND = 31923;

const channelTag = async (channelId, serverId) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode((serverId || 'default') + ':' + channelId));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

export async function subscribeChannelEvents(channelId, serverId, onList) {
  const net = window.nostrNet;
  if (!net || !channelId) { onList([]); return () => {}; }
  const tag = await channelTag(channelId, serverId);
  const byId = new Map();
  const emit = () => onList(Array.from(byId.values()).sort((a, b) => a.start - b.start));
  const subId = 'events-' + channelId;
  net.subscribe(subId, [{ kinds: [EVENT_KIND], '#e': [tag], limit: 100 }],
    (ev) => {
      if (!(ev.tags || []).some((t) => t[0] === 'e' && t[1] === tag)) return;
      const tagValue = (key) => ((ev.tags || []).find((t) => t[0] === key) || [])[1] || '';
      const start = Number(tagValue('start'));
      if (!start) return;
      const end = Number(tagValue('end'));
      byId.set(ev.id, { id: ev.id, title: tagValue('title') || 'Untitled event', start: start * 1000, end: end ? end * 1000 : null, location: tagValue('location'), author: ev.pubkey });
      emit();
    },
    () => emit());
  return () => net.unsubscribe(subId);
}
