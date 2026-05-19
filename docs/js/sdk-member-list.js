(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C) {
      setTimeout(init, 30);
      return;
    }
    const host = document.getElementById('memberList');
    if (!host) return;

    const { applyDiff, C } = sdk;
    host.innerHTML = '';

    function avatarColor(id) {
      return (window.getAvatarColor && window.getAvatarColor(id)) || 'var(--accent)';
    }

    function view() {
      const members = state.roomMembers || [];
      const online = [];
      const offline = [];
      for (const m of members) {
        const entry = {
          identity: m.id,
          name: m.displayName || m.username || m.id,
          color: avatarColor(m.id),
          status: m.online !== false ? 'online' : 'offline'
        };
        (m.online !== false ? online : offline).push(entry);
      }
      const categories = [];
      if (online.length) categories.push({ label: 'Online — ' + online.length, members: online });
      if (offline.length) categories.push({ label: 'Offline — ' + offline.length, members: offline });
      return C.MemberList({ categories, open: state.membersOpen !== false });
    }

    function render() { applyDiff(host, view()); }

    effect(() => {
      window.stateSignals.roomMembers.value;
      if (window.stateSignals.membersOpen) window.stateSignals.membersOpen.value;
      render();
    });

    if (window.uiMembers) window.uiMembers.render = function () {};
  }
  init();
})();
