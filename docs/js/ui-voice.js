const uiMembers = {
  categories() {
    const members = state.roomMembers || [];
    const roleColor = window.ROLE_COLOR || {};
    const sid = state.currentServerId;
    const getRole = (id) => (window.serverRoles && sid ? window.serverRoles.getRole(sid, id) : null) || 'member';

    const online = members.filter(m => m.online !== false);
    const offline = members.filter(m => m.online === false);
    const selfColor = (id) => { const sr = window.nostrSelfRoles; const ids = sr && sid ? sr.roles(sid, id) : []; return ids.length && sr.colorOf ? sr.colorOf(ids[0]) : null; };
    const toMember = (m) => ({
      identity: m.id,
      name: m.username,
      nameColor: state.roleColorsEnabled !== false ? (selfColor(m.id) || roleColor[getRole(m.id)] || null) : null,
      suffix: getRole(m.id) === 'owner' ? 'owner' : null,
      status: (() => { const st = window.nostrPresence ? window.nostrPresence.statusOf(m.id).status : 'online'; return m.online === false || st === 'invisible' ? 'offline' : st; })(),
      activity: m.id === state.nostrPubkey && state.voiceConnected && state.voiceChannelName ? '🔊 in ' + state.voiceChannelName : ((state.servers || []).find((x) => x && x.id === state.currentServerId) || {}).name ? 'Playing ' + ((state.servers || []).find((x) => x && x.id === state.currentServerId) || {}).name : '',
    });

    const owners = online.filter(m => getRole(m.id) === 'owner');
    const builders = online.filter(m => getRole(m.id) === 'editor');
    const rest = online.filter(m => getRole(m.id) !== 'owner' && getRole(m.id) !== 'editor');
    const cats = [];
    if (owners.length) cats.push({ label: 'Owner', members: owners.map(toMember) });
    if (builders.length) cats.push({ label: 'Builders', members: builders.map(toMember) });
    if (rest.length) cats.push({ label: 'Online', members: rest.map(toMember) });
    if (offline.length) cats.push({ label: 'Offline', members: offline.map(toMember) });
    return cats;
  }
};

window.__zellous.uiMembers = uiMembers;
window.uiMembers = uiMembers;
