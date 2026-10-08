// Identity and relay connection status.
export function buildSession({ v, call }) {
  const currentUser = () => {
    const pk = window.state && (window.state.userId || window.state.nostrPubkey);
    if (!pk) return v('currentUser', null);
    const resolved = window.chat && window.chat.resolveProfile && window.chat.resolveProfile(pk);
    return resolved ? { id: pk, username: resolved, displayName: resolved } : v('currentUser', null);
  };
  return {
    snapshot: () => ({
      // UserPanel (header) previously fell back to a literal "You" whenever
      // this was null -- while the message-row avatar for the SAME identity
      // derives its initial from resolveProfile(userId), the real npub-based
      // name. Two different fallbacks for one identity produced two
      // different avatar initials ("Y" vs "n") for the same user. Resolving
      // through the same helper keeps both surfaces showing one name.
      currentUser: currentUser(),
      userId: (window.state && (window.state.userId || window.state.nostrPubkey)) || null,
      isConnected: v('isConnected', true) ? true : !!v('relayGrace', true),
    }),
    actions: {
      retryConnection: () => call(() => { window.nostrNet.reconnectAll(); window.ui.showToast('Reconnecting...'); }),
    },
  };
}
