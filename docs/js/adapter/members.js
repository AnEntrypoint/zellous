import { trait } from '../modules/registry.js';
import { levelFor } from '../xp.js';

export function buildMembers({ v, call }) {
  return {
    snapshot: () => ({
      memberCategories: (window.uiMembers && window.uiMembers.categories && window.uiMembers.categories()) || [],
      memberApps: [{ identity: 'mustardbot', name: 'MustardBot', color: '#5865f2', activity: '/help · @MustardBot' }],
      memberListOpen: v('memberListOpen', false) && !v('homeMode', false) && trait((v('currentChannel', {}) || {}).type, 'members') !== false,
      ...levelFor(v('chatMessages', []), window.state && window.state.nostrPubkey),
    }),
    actions: {
      toggleMembers: () => call(() => window.ui.actions.toggleMembers()),
      memberMenu: (id, name, x, y) => call(() => window.moderation.showMemberMenu(id, name, x, y)),
    },
  };
}
