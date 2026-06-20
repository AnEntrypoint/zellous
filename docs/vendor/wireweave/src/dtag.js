const NAMESPACES = new Set(['ban', 'timeout', 'kick', 'page', 'channels', 'roles', 'settings']);

// Frozen on-relay wire prefix. The brand is now wireweave but deployed events
// carry 'zellous-' d-tags, so this is a published-contract constant — do not
// rename it without a migration path. parseDtag derives its slice offset from
// PREFIX.length so the literal and the offset can never drift apart.
const PREFIX = 'zellous-';

export const dtag = (ns, ...parts) => {
  if (!NAMESPACES.has(ns)) throw new Error('dtag: unknown namespace ' + ns);
  return [PREFIX + ns, ...parts].join(':');
};

export const parseDtag = (s) => {
  if (typeof s !== 'string' || !s.startsWith(PREFIX)) return null;
  const parts = s.slice(PREFIX.length).split(':');
  const ns = parts.shift();
  if (!NAMESPACES.has(ns)) return null;
  return { ns, parts };
};
