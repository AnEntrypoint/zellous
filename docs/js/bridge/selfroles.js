export function installSelfRoles(ww) {
  const selfRoles = ww.selfRoles;
  selfRoles.addEventListener('updated', () => { state.selfRolesVersion = (state.selfRolesVersion || 0) + 1; });
  window.nostrSelfRoles = {
    roles: (sid, pk) => selfRoles.roles(sid, pk),
    holders: (sid, id) => selfRoles.holders(sid, id),
    set: (sid, ids) => selfRoles.set(sid, ids),
    subscribe: (sid) => selfRoles.subscribe(sid)
  };
}
