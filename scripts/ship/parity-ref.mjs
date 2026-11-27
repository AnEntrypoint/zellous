import { NOW_MS, PEOPLE, MESSAGES, CHANNELS } from './parity-fixture.mjs';

const game3Dir = process.env.GAME3_DIR || new URL('../../../game-3', import.meta.url).pathname;
const { default: renderUi } = await import(game3Dir + '/scripts/ui.js');
const discord = await import(game3Dir + '/scripts/lib/discord.js');

const iso = (min) => new Date(NOW_MS - min * 60000).toISOString();
export const uid = (k) => (k === 'me' ? discord.OWNER : 'u_' + k);

export function buildLines(channel) {
  const src = MESSAGES[channel] || [];
  const lines = src.map((x) => ({ at: iso(x.min), by: { userId: uid(x.by), displayName: PEOPLE[x.by].name }, text: x.text }));
  src.forEach((x, i) => {
    if (x.replyTo === undefined) return;
    const t = lines[x.replyTo];
    lines[i].text = '↪' + t.by.userId + ':' + t.at + '¦' + x.text;
  });
  return lines;
}

export const lineKey = (channel, i) => { const l = buildLines(channel)[i]; return l.by.userId + ':' + l.at; };

export function ownServer(r) {
  r.ctx.world.state.servers = { 1: { name: 'game 3', owner: uid('me'), color: '#c4602f', born: 1, members: Object.keys(PEOPLE).map(uid), ch: ['general', 'gaming', 'memes', 'clips'].map((name, i) => ({ i, name })), vc: ['lounge', 'squad'].map((name, i) => ({ i, name })) } };
  r.player.state.servers = [1];
  r.player.state.channel = 's1c0';
  r.session.boards.s1c0 = buildLines('general');
}

export function listedServers(r) {
  const all = Object.keys(PEOPLE).map(uid);
  const mk = (name, color, ownerKey) => ({ name, owner: uid(ownerKey), ownerName: PEOPLE[ownerKey].name, color, born: 1, members: all, ch: ['general', 'gaming', 'memes', 'clips'].map((n, i) => ({ i, name: n })), vc: [] });
  r.ctx.world.state.servers = { 1: mk('Zellous Public', '#5865f2', 'mira'), 2: mk('game 3', '#c4602f', 'me') };
  r.player.state.servers = [1, 2];
}

export function buildReactions() {
  const out = {};
  for (const [ch, list] of Object.entries(MESSAGES)) {
    const lines = buildLines(ch);
    list.forEach((x, i) => {
      if (!x.reactions) return;
      const key = lines[i].by.userId + ':' + lines[i].at;
      out[key] = Object.fromEntries(x.reactions.map(([e, who]) => [e, who.map(uid)]));
    });
  }
  return out;
}

export function makeRef(overrides = {}) {
  const boards = {};
  for (const ch of [...CHANNELS.text]) boards[ch] = buildLines(ch);
  const players = ['me', 'mira', 'jun'].map((k) => ({ userId: uid(k), id: uid(k), displayName: PEOPLE[k].name, state: { status: PEOPLE[k].status, vc: null, roles: [] } }));
  const members = Object.fromEntries(Object.keys(PEOPLE).map((k) => [uid(k), { name: PEOPLE[k].name }]));
  const me = { userId: uid('me'), id: uid('me'), displayName: PEOPLE.me.name, state: { channel: 'general', status: 'online', prefs: {}, lastRead: {}, servers: [], vc: null, roles: [], xp: 160, saved: [], mutedCh: [], reminders: [] }, mail: [] };
  const session = { boards, boardsAt: NOW_MS };
  const ctx = {
    session,
    now: () => NOW_MS,
    world: { state: { servers: {}, members, reactions: buildReactions(), polls: {}, pins: {}, events: [], links: {}, xp: {}, radio: null } },
    place: { players },
    self: me,
  };
  Object.assign(session, overrides.session || {});
  Object.assign(me.state, overrides.me || {});
  return {
    ctx, player: me, session,
    render() {
      const RealDate = globalThis.Date;
      globalThis.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW_MS); } static now() { return NOW_MS; } };
      try { return renderUi(ctx, me); } finally { globalThis.Date = RealDate; }
    },
  };
}

export { discord };
