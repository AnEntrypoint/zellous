import { registerModule } from '../registry.js';
import { attachTerminal } from './terminal.js';

const BUFFER_LIMIT = 200000;

const sessionIdFor = (seed) => {
  let hash = 2166136261;
  for (const ch of String(seed)) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return 'sh' + hash.toString(16).padStart(8, '0');
};
const PUBLIC_SERVER_ID = '0000000000000000000000000000000000000000000000000000000000000000:public';

registerModule({
  id: 'sharesies',
  kind: 'service',
  setup(ctx) {
    const sh = ctx.ww.modules.sharesies;
    const sessions = ctx.signal('sessions', []);
    const activeId = ctx.signal('activeId', '');
    const share = ctx.signal('share', null);
    const live = new Map();
    const detachers = new Map();

    const publish = () => {
      sessions.value = [...live.values()].map((e) => ({
        id: e.id, state: e.session.state, host: !!e.session.hostPubkey, exitCode: e.session.exitCode, watch: e.watch,
        participants: (e.session.state === 'idle' || e.session.state === 'left') ? [] : e.session.participants.map((p) => ({ identity: p.identity, isHost: p.isHost })),
      }));
    };

    const start = async (input, { watch = false } = {}) => {
      const invite = sh.parseInvite(input);
      if (!invite) throw new Error('That is not a valid Sharesies invite or seed');
      const id = sessionIdFor(invite.seed);
      if (live.has(id)) { activeId.value = id; return id; }
      const session = new sh.SharesiesSession({ fsm: ctx.ww.fsm, xstate: ctx.xstate, relayPool: ctx.ww.pool, auth: ctx.ww.auth });
      const entry = { id, session, buffer: [], size: 0, watch };
      const keep = (e) => { entry.buffer.push(e.detail.data); entry.size += e.detail.data.length; while (entry.size > BUFFER_LIMIT && entry.buffer.length > 1) entry.size -= entry.buffer.shift().length; };
      session.addEventListener('stdout', keep);
      session.addEventListener('stderr', keep);
      for (const type of ['state', 'connected', 'disconnected', 'exit', 'participants', 'reconnecting']) session.addEventListener(type, publish);
      live.set(id, entry);
      if (!watch) activeId.value = id;
      publish();
      try { await session.join(invite.seed); } catch (e) { live.delete(id); if (activeId.value === id) activeId.value = ''; publish(); throw e; }
      publish();
      return id;
    };

    const leave = (id) => {
      const entry = live.get(id);
      if (!entry) return;
      entry.session.leave();
      const off = detachers.get(id);
      if (off) { off(); detachers.delete(id); }
      live.delete(id);
      if (activeId.value === id) activeId.value = '';
      publish();
    };

    const observer = new MutationObserver(() => {
      for (const host of document.querySelectorAll('[data-sharesies-term]')) {
        const id = host.getAttribute('data-sharesies-term');
        const entry = live.get(id);
        if (!entry || host.__attached === entry) continue;
        host.__attached = entry;
        attachTerminal(host, entry.session, entry.buffer).then((off) => { detachers.set(id, off); }).catch(() => { host.__attached = null; });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const currentTarget = () => ({ id: 'channel', kind: 'channel', label: '#' + ((ctx.state.currentChannel || {}).name || 'this channel'), public: ctx.state.currentServerId === PUBLIC_SERVER_ID });

    return {
      snapshot: () => {
        const dms = ((window.state && window.state.dmMessages) || []);
        const peers = [...new Set(dms.map((m) => m.peer))];
        return {
          sharesies: {
            sessions: sessions.value, activeId: activeId.value, share: share.value,
            targets: [currentTarget(), ...peers.map((p) => ({ id: p, kind: 'dm', label: '@ ' + (ctx.chat && ctx.chat.resolveProfile ? ctx.chat.resolveProfile(p) : p.slice(0, 8)), public: false }))],
          },
        };
      },
      actions: {
        sharesiesJoin: (input) => ctx.guard(() => start(input)),
        sharesiesOpen: (id) => { activeId.value = id; },
        sharesiesClosePanel: () => { activeId.value = ''; },
        sharesiesLeave: (id) => leave(id),
        sharesiesShareOpen: () => { share.value = { seed: null, command: '', url: '', app: 'bash', posted: false, watching: '' }; },
        sharesiesShareClose: () => { const cur = share.value; if (cur && cur.watching) leave(cur.watching); share.value = null; },
        sharesiesShareGenerate: (app) => ctx.guard(() => {
          const made = sh.createHostInvite({ app: (app || 'bash').trim() || 'bash' });
          share.value = { ...share.value, app: (app || 'bash').trim() || 'bash', seed: made.seed, command: made.command, url: made.url, posted: false, watching: '' };
        }),
        sharesiesSharePost: (targetId) => ctx.guard(async () => {
          const cur = share.value;
          if (!cur || !cur.url) throw new Error('Generate the command first');
          const text = cur.url;
          if (targetId === 'channel') await ctx.chat.send(text); else await ctx.dm.send(targetId, text);
          share.value = { ...cur, posted: true };
        }),
        sharesiesShareWatch: () => ctx.guard(async () => {
          const cur = share.value;
          if (!cur || !cur.seed) throw new Error('Generate the command first');
          const id = await start(cur.seed, { watch: true });
          share.value = { ...share.value, watching: id };
        }),
      },
    };
  },
});
