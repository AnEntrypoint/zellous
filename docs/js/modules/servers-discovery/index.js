import { registerModule } from '../registry.js';

registerModule({
  id: 'servers-discovery', kind: 'service',
  setup(ctx) {
    const { v, call, hooks, ww } = ctx;
    const proto = ww.modules.protocolFor('servers-discovery');
    const disc = proto.createServersDiscovery({ relayPool: ww.pool, auth: ww.auth });
    const version = ctx.signal('version', 0);
    const edits = ctx.signal('edits', {});
    const query = ctx.signal('query', '');
    const busy = ctx.signal('busy', false);
    let watched = null;

    disc.onChange(() => { version.value = version.value + 1; });
    hooks.on('surface:open:discover', () => disc.browse());
    hooks.on('surface:close', () => disc.stopBrowse());

    const follow = () => {
      const sid = v('currentServerId', null);
      if (sid === watched) return;
      watched = sid;
      if (sid) disc.watch(sid);
    };
    follow();
    setInterval(follow, 500);

    const serverOf = (sid) => (v('servers', []) || []).find((x) => x && x.id === sid) || null;
    const fieldsFor = (sid, view) => {
      const sv = serverOf(sid);
      const named = sv && sv.name && sv.name !== sid.slice(0, 8);
      return { ...view.fields, name: named ? sv.name : (view.fields.name || (sv && sv.name) || ''), ...(edits.value[sid] || {}) };
    };
    const contextFor = (sid, view, fields) => {
      const channels = v('channels', []) || [];
      return {
        fields,
        textChannels: channels.filter((c) => c && c.type === 'text').length,
        rulesPages: channels.filter((c) => c && ctx.trait(c.type, 'pageData')).length,
        appointedAdmins: view.appointedAdmins.length,
      };
    };
    const person = (pk) => ctx.nameOf(pk, String(pk).slice(0, 8));
    const mayManage = (view) => !!ww.auth.pubkey && (view.owner === ww.auth.pubkey || view.appointedAdmins.includes(ww.auth.pubkey));

    const run = (fn) => ctx.guard(async () => {
      busy.value = true;
      try { await fn(); } finally { busy.value = false; }
    });

    const current = () => {
      const sid = v('currentServerId', null);
      if (!sid) return null;
      const view = disc.view(sid);
      return { sid, view, fields: fieldsFor(sid, view) };
    };

    return {
      snapshot: () => {
        version.value; edits.value; busy.value;
        const joined = new Set((v('servers', []) || []).map((x) => x && x.id));
        const cur = current();
        const base = {
          discoverQuery: query.value,
          discoverListings: disc.listed().map((l) => ({
            id: l.serverId, name: l.name, description: l.description, icon: l.icon, category: l.category, tags: l.tags, language: l.language,
            by: person(l.by), at: l.at, joined: joined.has(l.serverId),
          })),
        };
        if (!cur) return { ...base, discovery: null };
        const { sid, view, fields } = cur;
        const requirements = proto.requirementsFor(contextFor(sid, view, fields));
        return {
          ...base,
          discovery: {
            serverId: sid, name: fields.name, status: view.status, canManage: mayManage(view), busy: busy.value,
            fields, requirements, ready: requirements.every((r) => r.ok), dirty: !!edits.value[sid],
            owner: person(view.owner), admins: view.appointedAdmins.map(person),
            categories: proto.CATEGORIES, languages: proto.LANGUAGES,
            log: view.log.map((l) => ({ action: l.action, status: l.status, by: person(l.by), at: l.at })),
            ignored: view.invalid.map((l) => ({ status: l.status, by: person(l.by), at: l.at })),
          },
        };
      },
      actions: {
        discoveryEdit: (patch) => call(() => {
          const sid = v('currentServerId', null);
          if (sid) edits.value = { ...edits.value, [sid]: { ...(edits.value[sid] || {}), ...patch } };
        }),
        discoverySave: () => run(async () => {
          const cur = current();
          if (!cur) return;
          await disc.save(cur.sid, cur.fields);
          edits.value = { ...edits.value, [cur.sid]: undefined };
        }),
        discoveryPromote: () => run(async () => {
          const cur = current();
          if (!cur) return;
          await disc.promote(cur.sid, cur.fields, contextFor(cur.sid, cur.view, cur.fields));
          edits.value = { ...edits.value, [cur.sid]: undefined };
        }),
        discoveryRemove: () => run(async () => {
          const cur = current();
          if (!cur) return;
          await disc.remove(cur.sid, cur.fields);
          edits.value = { ...edits.value, [cur.sid]: undefined };
        }),
        discoverSearch: (q) => call(() => { query.value = String(q || '').slice(0, 80); }),
      },
    };
  },
});
