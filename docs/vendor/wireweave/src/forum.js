const hexChannelId = async (channelId, serverId) => {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode((serverId || 'default') + ':' + channelId));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

// Forum posts on a channel: kind:11 (NIP-7D-style thread root, tagged to the
// channel exactly like chat.js's kind:42 messages) + kind:1111 (NIP-22
// generic comment, uppercase root E/K tags + lowercase parent e/k tags) for
// replies within a post's own thread. No relay-side aggregation needed --
// replyCount is derived client-side from however many kind:1111 events
// tag a given post as root, same discipline chat.js already uses for
// channel-scoped kind:42 filtering via a hashed channel tag.
export class Forum extends EventTarget {
  constructor({ relayPool, auth }) {
    super();
    if (!relayPool || !auth) throw new Error('Forum: relayPool + auth required');
    this.pool = relayPool; this.auth = auth;
    this.posts = new Map(); // channelId -> Map(postId -> post)
    this.replies = new Map(); // postId -> [{id, author, content, timestamp}]
    this.activeChannelId = null;
    this.activePostId = null;
  }

  async createPost(channelId, serverId, title, content) {
    if (!this.auth.isLoggedIn()) throw new Error('Not logged in');
    const trimmedTitle = (title || '').trim();
    if (!trimmedTitle) throw new Error('Post title cannot be empty');
    const chanHex = await hexChannelId(channelId, serverId);
    const signed = await this.auth.sign({
      kind: 11, created_at: Math.floor(Date.now() / 1000),
      tags: [['e', chanHex, '', 'root'], ['title', trimmedTitle]],
      content: (content || '').trim()
    });
    this.pool.publish(signed);
    this._applyPost(channelId, signed);
    return signed;
  }

  async reply(postId, postAuthorPubkey, content) {
    if (!this.auth.isLoggedIn()) throw new Error('Not logged in');
    const trimmed = (content || '').trim();
    if (!trimmed) throw new Error('Reply cannot be empty');
    const signed = await this.auth.sign({
      kind: 1111, created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['E', postId], ['K', '11'], ['P', postAuthorPubkey],
        ['e', postId], ['k', '11']
      ],
      content: trimmed
    });
    this.pool.publish(signed);
    this._applyReply(signed);
    return signed;
  }

  listFor(channelId) {
    const m = this.posts.get(channelId);
    if (!m) return [];
    return Array.from(m.values())
      .map((p) => ({ ...p, replyCount: (this.replies.get(p.id) || []).length }))
      .sort((a, b) => b.time - a.time);
  }

  repliesFor(postId) { return (this.replies.get(postId) || []).slice().sort((a, b) => a.timestamp - b.timestamp); }

  async loadChannel(channelId, serverId) {
    if (this.activeChannelId) this.pool.unsubscribe('forum-' + this.activeChannelId);
    this.activeChannelId = channelId;
    if (!this.posts.has(channelId)) this.posts.set(channelId, new Map());
    const chanHex = await hexChannelId(channelId, serverId);
    this.pool.subscribe('forum-' + channelId,
      [{ kinds: [11], '#e': [chanHex], limit: 100 }],
      (ev) => this._applyPost(channelId, ev),
      () => this._emitList(channelId));
  }

  loadReplies(postId) {
    if (this.activePostId) this.pool.unsubscribe('forum-replies-' + this.activePostId);
    this.activePostId = postId;
    this.pool.subscribe('forum-replies-' + postId,
      [{ kinds: [1111], '#e': [postId] }],
      (ev) => this._applyReply(ev),
      () => this._emit('replies', { postId, replies: this.repliesFor(postId) }));
  }

  _applyPost(channelId, event) {
    if (!this.posts.has(channelId)) this.posts.set(channelId, new Map());
    const m = this.posts.get(channelId);
    const titleTag = (event.tags || []).find((t) => t[0] === 'title');
    m.set(event.id, {
      id: event.id, title: titleTag?.[1] || '(untitled)', snippet: (event.content || '').slice(0, 140),
      author: event.pubkey, time: event.created_at * 1000
    });
    this._emitList(channelId);
  }

  _applyReply(event) {
    const rootTag = (event.tags || []).find((t) => t[0] === 'E') || (event.tags || []).find((t) => t[0] === 'e');
    if (!rootTag?.[1]) return;
    const postId = rootTag[1];
    if (!this.replies.has(postId)) this.replies.set(postId, []);
    const list = this.replies.get(postId);
    if (list.some((r) => r.id === event.id)) return;
    list.push({ id: event.id, author: event.pubkey, content: event.content, timestamp: event.created_at * 1000 });
    this._emit('replies', { postId, replies: this.repliesFor(postId) });
  }

  _emitList(channelId) { this.dispatchEvent(new CustomEvent('posts', { detail: { channelId, posts: this.listFor(channelId) } })); }
  _emit(t, d) { this.dispatchEvent(new CustomEvent(t, { detail: d })); }
}

export const createForum = (opts) => new Forum(opts);
