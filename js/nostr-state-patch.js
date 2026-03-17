(() => {
  const sig = window.__signal;
  const raw = window.stateSignals;

  raw.nostrPubkey = sig('');
  raw.nostrPrivkey = sig(null);
  raw.nostrRelays = sig([
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.snort.social'
  ]);
  raw.nostrRelayStatus = sig(new Map());
  raw.nostrProfile = sig(null);
  raw.nostrSubscriptions = sig(new Map());
})();
