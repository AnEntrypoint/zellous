const uiMembers = {
  categories() {
    const members = state.roomMembers || [];
    const roleOrder = ['owner', 'admin', 'moderator', 'member'];
    const roleLabel = { owner: 'Owner', admin: 'Admin', moderator: 'Moderator', member: 'Members' };
    const roleColor = window.ROLE_COLOR || {};
    const sid = state.currentServerId;
    const getRole = (id) => (window.serverRoles && sid ? window.serverRoles.getRole(sid, id) : null) || 'member';

    const online = members.filter(m => m.online !== false);
    const offline = members.filter(m => m.online === false);
    const toMember = (m) => ({
      identity: m.id,
      name: m.username,
      color: roleColor[getRole(m.id)] || (window.getAvatarColor ? window.getAvatarColor(m.id) : null),
      status: m.online !== false ? 'online' : 'offline',
    });

    const byRole = {};
    online.forEach(m => { const r = getRole(m.id); (byRole[r] = byRole[r] || []).push(m); });

    const cats = [];
    roleOrder.forEach(role => {
      if (!byRole[role] || !byRole[role].length) return;
      cats.push({ label: roleLabel[role] || role, members: byRole[role].map(toMember) });
    });
    const nonStd = online.filter(m => !roleOrder.includes(getRole(m.id)));
    if (nonStd.length) cats.push({ label: 'Members', members: nonStd.map(toMember) });
    if (offline.length) cats.push({ label: 'Offline', members: offline.map(toMember) });
    return cats;
  }
};

// uiVoice's DOM-rendering methods (renderGrid/renderQueue/renderPanel) and
// uiMembers.render() were deleted 2026-07-31 -- they only ever targeted the
// legacy hidden .app scaffold (removed the same day) and had zero live
// callers once ui.render.* became no-ops. The SDK's own .vx-grid/.vx-queue/
// MemberList components (mountCommunityApp) render the real UI, fed by
// nostr-adapter.js's voiceParticipants/memberCategories()/audioQueue* fields.
window.__zellous.uiMembers = uiMembers;
window.uiMembers = uiMembers;
