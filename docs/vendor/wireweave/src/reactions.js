// NIP-25 (kind:7) reactions on native kind:42 channel messages. Aggregation is
// client-side, last-write-wins per (pubkey, target) -- a user's newest reaction
// event replaces their prior one, matching how a real Nostr client displays
// "who reacted with what" without needing a relay-side NIP-25 aggregator.
export class Reactions extends EventTarget {
  constructor({ relayPool, auth }) {
    super();
    if (!relayPool || !auth) throw new Error('Reactions: relayPool + auth required');
    this.pool = relayPool; this.auth = auth;
    this.byTarget = new Map(); // targetEventId -> Map(pubkey -> {content, id, created_at})
    this.subs = new Map();
  }

  async react(targetEventId, targetAuthorPubkey, content = '+') {
    if (!this.auth.isLoggedIn()) throw new Error('Not logged in');
    if (!targetEventId) throw new Error('targetEventId required');
    const tags = [['e', targetEventId], ['k', '42']];
    if (targetAuthorPubkey) tags.push(['p', targetAuthorPubkey]);
    const signed = await this.auth.sign({ kind: 7, created_at: Math.floor(Date.now() / 1000), tags, content });
    this.pool.publish(signed);
    // Locally-originated: this IS the user's own fresh intent, so it always
    // wins over whatever's cached for them, even at equal created_at
    // (second-granularity timestamps make same-second re-reactions common).
    this._applyReaction(signed, { local: true });
    return signed;
  }

  async unreact(targetEventId) {
    if (!this.auth.isLoggedIn()) throw new Error('Not logged in');
    const mine = this.byTarget.get(targetEventId)?.get(this.auth.pubkey);
    if (!mine) return;
    const signed = await this.auth.sign({ kind: 5, created_at: Math.floor(Date.now() / 1000), tags: [['e', mine.id]], content: 'deleted' });
    this.pool.publish(signed);
    this.byTarget.get(targetEventId)?.delete(this.auth.pubkey);
    this._emitFor(targetEventId);
  }

  getFor(targetEventId) {
    const m = this.byTarget.get(targetEventId);
    if (!m) return [];
    const counts = new Map();
    for (const { content } of m.values()) counts.set(content, (counts.get(content) || 0) + 1);
    return Array.from(counts.entries()).map(([content, count]) => ({
      content, count,
      mine: m.get(this.auth.pubkey)?.content === content
    }));
  }

  subscribeMany(targetEventIds) {
    const fresh = targetEventIds.filter(id => id && !this.subs.has(id));
    if (!fresh.length) return;
    fresh.forEach(id => this.subs.set(id, true));
    const subId = 'reactions-' + fresh[0] + '-' + fresh.length;
    this.pool.subscribe(subId, [{ kinds: [7], '#e': fresh }], (event) => this._applyReaction(event));
  }

  _applyReaction(event, { local = false } = {}) {
    const targetTag = (event.tags || []).find(t => t[0] === 'e');
    if (!targetTag?.[1]) return;
    const targetId = targetTag[1];
    if (!this.byTarget.has(targetId)) this.byTarget.set(targetId, new Map());
    const m = this.byTarget.get(targetId);
    const existing = m.get(event.pubkey);
    if (!local && existing && existing.created_at > event.created_at) return;
    m.set(event.pubkey, { content: event.content || '+', id: event.id, created_at: event.created_at });
    this._emitFor(targetId);
  }

  _emitFor(targetId) {
    this.dispatchEvent(new CustomEvent('updated', { detail: { targetId, reactions: this.getFor(targetId) } }));
  }
}

export const createReactions = (opts) => new Reactions(opts);
