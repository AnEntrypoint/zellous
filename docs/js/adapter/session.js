export function buildSession({ v, call }) {
  const currentUser = () => {
    const pk = window.state && (window.state.userId || window.state.nostrPubkey);
    if (!pk) return v('currentUser', null);
    const resolved = window.chat && window.chat.resolveProfile && window.chat.resolveProfile(pk);
    return resolved ? { id: pk, username: resolved, displayName: resolved } : v('currentUser', null);
  };
  return {
    snapshot: () => ({
      currentUser: currentUser(),
      userId: (window.state && (window.state.userId || window.state.nostrPubkey)) || null,
      isConnected: v('isConnected', true) ? true : !!v('relayGrace', true),
    }),
    actions: {
      retryConnection: () => call(() => { window.nostrNet.reconnectAll(); window.ui.showToast('Reconnecting...'); }),
    },
  };
}
