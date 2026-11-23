import { levelFor, leaderboardFor, progressFor } from './xp.js';

const BALL = ['It is certain.', 'Without a doubt.', 'Ask again later.', "Don't count on it.", 'Very doubtful.', 'Yes, definitely.', 'Outlook good.', 'My sources say no.', 'Signs point to yes.', 'Better not tell you now.'];

const roll = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

export function runCommand(raw, me, env = {}) {
  const m = /^\/(\w+)\s*([\s\S]*)$/.exec(raw);
  if (!m) return { text: raw };
  const [, cmd, rest] = m;
  switch (cmd.toLowerCase()) {
    case 'shrug': return { text: (rest + ' ¯\\_(ツ)_/¯').trim() };
    case 'tableflip': return { text: (rest + ' (╯°□°)╯︵ ┻━┻').trim() };
    case 'unflip': return { text: (rest + ' ┬─┬ノ( º _ ºノ)').trim() };
    case 'lenny': return { text: (rest + ' ( ͡° ͜ʖ ͡°)').trim() };
    case 'me': return rest ? { text: '_' + rest + '_' } : { notice: 'usage: /me does a thing' };
    case 'spoiler': return rest ? { text: '||' + rest + '||' } : { notice: 'usage: /spoiler secret' };
    case 'poll': {
      const parts = rest.split('|').map((x) => x.trim().replace(/¦/g, '')).filter(Boolean);
      if (parts.length < 3 || parts.length > 6) return { notice: 'usage: /poll question | option | option (2 to 5 options)' };
      return { text: '📊¦' + parts.map((x) => x.slice(0, 40)).join('¦') };
    }
    case 'roll': { const n = Math.max(2, Math.min(1000, parseInt(rest, 10) || 6)); return { text: '🎲 ' + me + ' rolled a **' + (1 + roll(n)) + '** (1-' + n + ')' }; }
    case 'coinflip': case 'flip': return { text: '🪙 ' + me + ' flipped **' + (roll(2) ? 'tails' : 'heads') + '**' };
    case '8ball': return { text: '🎱 ' + (rest ? '"' + rest.slice(0, 80) + '" ' : '') + '→ ' + BALL[roll(BALL.length)] };
    case 'rank': {
      const { level, xp } = levelFor(env.messages || [], env.pubkey);
      return { text: '📈 ' + me + ' is **level ' + level + '** with ' + xp + ' XP. ' + (40 * (level + 1) * (level + 1) - xp) + ' XP to level ' + (level + 1) };
    }
    case 'top': case 'leaderboard': {
      const rows = leaderboardFor(env.messages || []).slice(0, 5);
      return { text: rows.length ? '🏆 ' + rows.map((r, i) => (i + 1) + '. ' + env.nameOf(r.id) + ' (lv ' + progressFor(r.xp).level + ')').join(' · ') : '🏆 nobody has XP yet. start chatting!' };
    }
    case 'invite': {
      const mine = env.servers || [], q = rest.trim().toLowerCase();
      const sv = q ? mine.find((x) => String(x.name).toLowerCase().startsWith(q)) : (mine.find((x) => x.id === env.currentServerId) || mine[0]);
      if (!sv) return { notice: mine.length ? 'no server of yours starts with "' + rest.trim() + '"' : 'join or make a server first, then /invite drops its card' };
      return { text: env.inviteContent(sv) };
    }
    case 'remind': {
      const r = /^(\d+)\s*(m|min|h|hr|s)?\s+([\s\S]+)$/i.exec(rest.trim());
      if (!r) return { notice: '/remind 10m stretch your legs · /remind 2h check the oven' };
      const n = +r[1], u = (r[2] || 'm').toLowerCase(), mins = u.startsWith('h') ? n * 60 : u === 's' ? n / 60 : n;
      if (!(mins > 0 && mins <= 7 * 24 * 60)) return { notice: 'pick between 1 minute and 7 days' };
      return { remind: { minutes: mins, text: r[3].slice(0, 160) } };
    }
    case 'help': return { notice: '/invite /remind /rank /top /shrug /tableflip /unflip /lenny /me /spoiler /poll /roll /coinflip /8ball' };
    default: return { notice: 'unknown command /' + cmd + '. try /help' };
  }
}
