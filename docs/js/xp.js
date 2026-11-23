export const XP_PER_MESSAGE = 10;

export const progressFor = (xp) => {
  const level = Math.floor(Math.sqrt(xp / 40));
  const base = 40 * level * level;
  const next = 40 * (level + 1) * (level + 1);
  return { level, xp, xpPct: ((xp - base) / (next - base)) * 100 };
};

export const levelFor = (messages, pubkey) => {
  const mine = pubkey ? (messages || []).filter((m) => m && m.userId === pubkey).length : 0;
  return progressFor(mine * XP_PER_MESSAGE);
};

export const leaderboardFor = (messages) => {
  const counts = new Map();
  (messages || []).forEach((m) => { if (m && m.userId) counts.set(m.userId, (counts.get(m.userId) || 0) + 1); });
  return Array.from(counts, ([id, n]) => ({ id, ...progressFor(n * XP_PER_MESSAGE) })).sort((a, b) => b.xp - a.xp);
};

export const statsFor = (messages) => {
  const stats = {};
  (messages || []).forEach((m) => {
    if (!m || !m.userId) return;
    const row = stats[m.userId] || (stats[m.userId] = { count: 0, firstSeen: 0 });
    row.count += 1;
    if (m.timestamp && (!row.firstSeen || m.timestamp < row.firstSeen)) row.firstSeen = m.timestamp;
  });
  Object.values(stats).forEach((row) => { row.level = progressFor(row.count * XP_PER_MESSAGE).level; row.xp = row.count * XP_PER_MESSAGE; });
  return stats;
};
