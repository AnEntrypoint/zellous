import { channelTag } from './channel-scope.js';

export async function subscribeSplitMessages(channelId, serverId, onList) {
  const net = window.nostrNet;
  if (!net || !channelId || !serverId) { onList([]); return () => {}; }
  const tag = await channelTag(channelId, serverId);
  const byId = new Map();
  const emit = () => onList(Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp));
  const subId = 'split-' + channelId;
  net.subscribe(subId, [{ kinds: [42], '#e': [tag], limit: 50 }],
    (ev) => {
      if (!(ev.tags || []).some((t) => t[0] === 'e' && t[1] === tag)) return;
      byId.set(ev.id, { id: ev.id, userId: ev.pubkey, content: String(ev.content || ''), timestamp: ev.created_at * 1000 });
      emit();
    },
    () => emit());
  return () => net.unsubscribe(subId);
}
