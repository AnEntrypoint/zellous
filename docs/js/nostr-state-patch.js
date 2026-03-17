(() => {
  const sig = window.__signal;
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
})();
