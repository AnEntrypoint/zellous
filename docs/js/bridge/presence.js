export function installPresence(ww) {
  const presence = ww.presence;
  presence.addEventListener('updated', () => { state.presenceVersion = (state.presenceVersion || 0) + 1; });
  window.nostrPresence = {
    statusOf: (pk) => presence.statusOf(pk),
    set: (status, custom) => presence.set(status, custom),
    subscribe: (pks) => presence.subscribe(pks)
  };
}
