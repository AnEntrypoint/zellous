const ORDER = [['owner', 'Server Owner'], ['admin', 'Admin'], ['moderator', 'Moderator'], ['member', 'Online']];

export const rolesFor = (members, serverId) => {
  const roleOf = (id) => (window.serverRoles && serverId ? window.serverRoles.getRole(serverId, id) : null) || 'member';
  const counts = new Map(ORDER.map(([id]) => [id, 0]));
  (members || []).forEach((m) => {
    const r = roleOf(m.id);
    counts.set(r, (counts.get(r) || 0) + 1);
  });
  return ORDER.map(([id, label]) => ({ id, label, count: counts.get(id) || 0 }));
};
