const BALL = ['It is certain.', 'Without a doubt.', 'Ask again later.', "Don't count on it.", 'Very doubtful.', 'Yes, definitely.', 'Outlook good.', 'My sources say no.', 'Signs point to yes.', 'Better not tell you now.'];

const roll = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

export function runCommand(raw, me) {
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
    case 'help': return { notice: '/shrug /tableflip /unflip /lenny /me /spoiler /poll /roll /coinflip /8ball' };
    default: return { text: raw };
  }
}
