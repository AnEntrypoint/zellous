const NAMESPACES = new Set(['ban', 'timeout', 'kick', 'page', 'channels', 'roles', 'settings']);

export const dtag = (ns, ...parts) => {
  if (!NAMESPACES.has(ns)) throw new Error('dtag: unknown namespace ' + ns);
  return ['zellous-' + ns, ...parts].join(':');
};

export const parseDtag = (s) => {
  if (typeof s !== 'string' || !s.startsWith('zellous-')) return null;
  const parts = s.slice(8).split(':');
  const ns = parts.shift();
  if (!NAMESPACES.has(ns)) return null;
  return { ns, parts };
};
