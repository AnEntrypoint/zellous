const XP_PER_MESSAGE = 10;
const levelFor = (messages, pubkey) => {
  const mine = pubkey ? (messages || []).filter(m => m && m.userId === pubkey).length : 0;
  const xp = mine * XP_PER_MESSAGE;
  const level = Math.floor(Math.sqrt(xp / 40));
  const base = 40 * level * level;
  const next = 40 * (level + 1) * (level + 1);
  return { level, xp, xpPct: ((xp - base) / (next - base)) * 100 };
};

export function buildMembers({ v, call }) {
  return {
    snapshot: () => ({
      memberCategories: (window.uiMembers && window.uiMembers.categories && window.uiMembers.categories()) || [],
      memberListOpen: v('memberListOpen', false) && !v('homeMode', false) && (v('currentChannel', {}) || {}).type !== 'voice',
      ...levelFor(v('chatMessages', []), window.state && window.state.nostrPubkey),
    }),
    actions: {
      toggleMembers: () => call(() => window.ui.actions.toggleMembers()),
      memberMenu: (id, name, x, y) => call(() => window.moderation.showMemberMenu(id, name, x, y)),
    },
  };
}
