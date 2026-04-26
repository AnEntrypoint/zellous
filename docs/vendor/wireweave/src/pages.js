const sanitize = (html) => {
  if (typeof document === 'undefined') return html;
  const el = document.createElement('div');
  el.innerHTML = html;
  el.querySelectorAll('script,iframe,object,embed,form,input,button').forEach(n => n.remove());
  el.querySelectorAll('*').forEach(n => {
    [...n.attributes].forEach(a => {
      if (/^on/i.test(a.name) || (a.name === 'href' && /^javascript:/i.test(a.value)) || (a.name === 'src' && /^javascript:/i.test(a.value))) n.removeAttribute(a.name);
    });
  });
  return el.innerHTML;
};

export class Pages extends EventTarget {
  constructor({ relayPool, auth, roles }) {
    super();
    if (!relayPool || !auth || !roles) throw new Error('Pages: deps required');
    this.pool = relayPool; this.auth = auth; this.roles = roles;
    this.store = new Map(); this.subs = new Map();
  }

  _key(serverId, slug) { return 'zellous-page:' + serverId + ':' + slug; }
  getPages(serverId) { return Array.from((this.store.get(serverId) || new Map()).values()); }

  subscribe(serverId) {
    if (this.subs.has(serverId)) return;
    const creator = serverId?.split(':')[0];
    if (!creator) return;
    const subId = 'pages-' + serverId;
    this.subs.set(serverId, subId);
    this.pool.subscribe(subId,
      [{ kinds: [30078], authors: [creator] }],
      (event) => {
        if (event.pubkey !== creator) return;
        const dTag = (event.tags.find(t => t[0] === 'd') || [])[1] || '';
        const prefix = 'zellous-page:' + serverId + ':';
        if (!dTag.startsWith(prefix)) return;
        const slug = dTag.slice(prefix.length); if (!slug) return;
        try {
          const data = JSON.parse(event.content);
          const pages = this.store.get(serverId) || new Map();
          if (data.deleted) pages.delete(slug);
          else pages.set(slug, { slug, title: data.title || slug, html: sanitize(data.html || ''), updatedAt: event.created_at });
          this.store.set(serverId, pages);
          this.dispatchEvent(new CustomEvent('updated', { detail: { serverId, pages: this.getPages(serverId) } }));
        } catch {}
      });
  }

  unsubscribe(serverId) {
    const subId = this.subs.get(serverId);
    if (subId) { this.pool.unsubscribe(subId); this.subs.delete(serverId); }
  }

  async publish(serverId, slug, title, html) {
    if (!this.roles.isAdmin(serverId)) throw new Error('Admin only');
    const safe = sanitize(html);
    const signed = await this.auth.sign({ kind: 30078, created_at: Math.floor(Date.now() / 1000), tags: [['d', this._key(serverId, slug)]], content: JSON.stringify({ title, html: safe }) });
    this.pool.publish(signed);
    const pages = this.store.get(serverId) || new Map();
    pages.set(slug, { slug, title, html: safe, updatedAt: Math.floor(Date.now() / 1000) });
    this.store.set(serverId, pages);
    this.dispatchEvent(new CustomEvent('updated', { detail: { serverId, pages: this.getPages(serverId) } }));
  }

  async deletePage(serverId, slug) {
    if (!this.roles.isAdmin(serverId)) throw new Error('Admin only');
    const signed = await this.auth.sign({ kind: 30078, created_at: Math.floor(Date.now() / 1000), tags: [['d', this._key(serverId, slug)]], content: JSON.stringify({ deleted: true }) });
    this.pool.publish(signed);
    const pages = this.store.get(serverId) || new Map();
    pages.delete(slug);
    this.store.set(serverId, pages);
    this.dispatchEvent(new CustomEvent('updated', { detail: { serverId, pages: this.getPages(serverId) } }));
  }
}

export const createPages = (opts) => new Pages(opts);
