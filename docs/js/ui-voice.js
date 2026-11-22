const uiMembers = {
  categories() {
    const members = state.roomMembers || [];
    const roleOrder = ['owner', 'admin', 'moderator', 'member'];
    const roleLabel = { owner: 'Server Owner', admin: 'Admin', moderator: 'Moderator', member: 'Online' };
    const roleColor = window.ROLE_COLOR || {};
    const sid = state.currentServerId;
    const getRole = (id) => (window.serverRoles && sid ? window.serverRoles.getRole(sid, id) : null) || 'member';

    const online = members.filter(m => m.online !== false);
    const offline = members.filter(m => m.online === false);
    const selfColor = (id) => { const sr = window.nostrSelfRoles; const ids = sr && sid ? sr.roles(sid, id) : []; return ids.length && sr.colorOf ? sr.colorOf(ids[0]) : null; };
    const toMember = (m) => ({
      identity: m.id,
      name: m.username,
      color: roleColor[getRole(m.id)] || (window.getAvatarColor ? window.getAvatarColor(m.id) : null),
      nameColor: state.roleColorsEnabled !== false ? (selfColor(m.id) || roleColor[getRole(m.id)] || null) : null,
      suffix: getRole(m.id) === 'owner' ? 'owner' : null,
      status: (() => { const st = window.nostrPresence ? window.nostrPresence.statusOf(m.id).status : 'online'; return m.online === false || st === 'invisible' ? 'offline' : st; })(),
      activity: m.id === state.nostrPubkey && state.voiceConnected && state.voiceChannelName ? '🔊 in ' + state.voiceChannelName : ((state.servers || []).find((x) => x && x.id === state.currentServerId) || {}).name ? 'Playing ' + ((state.servers || []).find((x) => x && x.id === state.currentServerId) || {}).name : '',
    });

    const byRole = {};
    online.forEach(m => { const r = getRole(m.id); (byRole[r] = byRole[r] || []).push(m); });

    const cats = [];
    roleOrder.forEach(role => {
      if (!byRole[role] || !byRole[role].length) return;
      cats.push({ label: roleLabel[role] || role, members: byRole[role].map(toMember) });
    });
    const nonStd = online.filter(m => !roleOrder.includes(getRole(m.id)));
    if (nonStd.length) cats.push({ label: 'Online', members: nonStd.map(toMember) });
    if (offline.length) cats.push({ label: 'Offline', members: offline.map(toMember) });
    return cats;
  }
};

window.__zellous.uiMembers = uiMembers;
window.uiMembers = uiMembers;
