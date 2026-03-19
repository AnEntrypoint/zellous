(() => {
  const sig = window.__signal;
  const eff = window.__effect;
  const raw = window.stateSignals;

  raw.nostrPubkey = sig('');
  raw.nostrPrivkey = sig(null);
  raw.nostrRelays = sig([
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://relay.snort.social',
    'wss://nos.lol',
    'wss://relay.olas.app',
    'wss://nostr.mom'
  ]);
  raw.nostrRelayStatus = sig(new Map());
  raw.nostrProfile = sig(null);
  raw.nostrSubscriptions = sig(new Map());

  eff(() => {
    const msgs = raw.chatMessages.value;
    const seen = new Map();
    for (const m of msgs) {
      if (m.userId && !seen.has(m.userId)) {
        seen.set(m.userId, { id: m.userId, username: m.username || m.userId.slice(0, 8) });
      }
    }
    raw.roomMembers.value = Array.from(seen.values());
  });
})();
