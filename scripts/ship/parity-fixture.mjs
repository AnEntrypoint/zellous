import { createHash } from 'node:crypto';

export const NOW_ISO = '2026-06-15T15:30:00.000Z';
export const NOW_MS = Date.parse(NOW_ISO);
export const NOW_SEC = Math.floor(NOW_MS / 1000);

export const PEOPLE = {
  me: { name: 'Alex', status: 'online' },
  mira: { name: 'Mira', status: 'online' },
  jun: { name: 'Jun', status: 'idle' },
  sol: { name: 'Sol', status: 'dnd' },
};

export const secretOf = (key) => createHash('sha256').update('parity-fixture-' + key).digest('hex');

export const SERVER_NAME = 'game 3';

export const CHANNELS = {
  pages: ['rules', 'pick-roles'],
  text: ['announcements', 'general', 'gaming', 'memes', 'clips'],
  voice: ['lounge', 'squad'],
};

const m = (min, by, text, extra = {}) => ({ min, by, text, ...extra });

export const MESSAGES = {
  general: [
    m(88, 'mira', 'hey everyone, who is on tonight?'),
    m(87, 'mira', 'thinking of a few rounds later'),
    m(80, 'jun', 'I am in, give me ten minutes', { reactions: [['👍', ['mira', 'sol']], ['😂', ['mira']]] }),
    m(60, 'me', 'sounds good, **bold plan** and `code`', { replyTo: 2 }),
    m(45, 'sol', '🏷¦mustard'),
    m(30, 'mira', '@Alex check this out https://example.com/page'),
    m(20, 'jun', '😂😂'),
    m(12, 'me', 'a ||spoiler|| line to test'),
    m(5, 'mira', '📊¦Game tonight?¦Yes¦No¦Maybe'),
    m(4, 'jun', 'be right back'),
  ],
  announcements: [
    m(600, 'mira', 'Welcome to the server, read the rules first'),
  ],
  gaming: [],
  memes: [],
  clips: [],
};

export const VOICE_OCCUPANTS = { lounge: ['mira', 'jun'], squad: [] };
