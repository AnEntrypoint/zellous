import { registerModule } from '../registry.js';

registerModule({
  id: 'devpanel', kind: 'service',
  setup(ctx) {
    const { S, v, call, state } = ctx;

    const devInfo = () => {
      const tick = v('devTick', 0);
      const traffic = tick >= 0 && ctx.inspect ? ctx.inspect().relayTraffic || [] : [];
      const q = String(v('devEventFilter', '') || '').toLowerCase();
      const statusMap = new Map(state.nostrRelayStatus || []);
      const relays = (state.nostrRelays || Array.from(statusMap.keys())).map((u) => ({ url: u, status: String(statusMap.get(u) || 'unknown') }));
      const open = relays.filter((r) => r.status === 'connected' || r.status === 'open').length;
      const roomMembers = state.roomMembers || [];
      return {
        connection: relays.length ? open + ' of ' + relays.length + ' relays connected' : 'no relays configured',
        relays,
        traffic,
        presence: ctx.presence && state.nostrPubkey ? ctx.presence.statusOf(state.nostrPubkey).status : 'unknown',
        channels: (v('channels', []) || []).filter(Boolean).map((c) => ({ id: c.id, name: c.name, type: c.type })),
        events: (v('channelEvents', []) || []).filter((e) => !q || String(e.title || '').toLowerCase().includes(q)).slice(0, 20).map((e) => ({ title: e.title, start: e.start })),
        filter: q,
        members: roomMembers.map((m) => ({ id: m.id, name: m.username, status: m.online === false ? 'offline' : (ctx.presence ? ctx.presence.statusOf(m.id).status : 'online') })),
      };
    };

    return {
      snapshot: () => ({ devInfo: devInfo() }),
      actions: {
        refreshDev: () => call(() => { if (S.devTick) S.devTick.value += 1; }),
        setDevFilter: (q) => call(() => { if (S.devEventFilter) S.devEventFilter.value = String(q || ''); }),
        resetLocalState: () => call(() => {
          for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('zellous-')) localStorage.removeItem(k); }
          location.reload();
        }),
      },
    };
  },
});
