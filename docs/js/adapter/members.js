export function buildMembers({ v, call }) {
  return {
    snapshot: () => ({
      memberCategories: (window.uiMembers && window.uiMembers.categories && window.uiMembers.categories()) || [],
      memberListOpen: v('memberListOpen', false),
    }),
    actions: {
      toggleMembers: () => call(() => window.ui.actions.toggleMembers()),
      memberMenu: (id, name, x, y) => call(() => window.moderation.showMemberMenu(id, name, x, y)),
    },
  };
}
