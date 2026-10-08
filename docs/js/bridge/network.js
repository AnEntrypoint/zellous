export function installNetwork(ww) {
  // Relay pool bridge
  const net = ww.pool;
  window.nostrNet = window.network = {
    connect: () => net.connect(),
    disconnect: () => net.disconnect(),
    subscribe: (id, filters, onEvent, onEose) => net.subscribe(id, filters, onEvent, onEose),
    unsubscribe: (id) => net.unsubscribe(id),
    publish: (event) => net.publish(event),
    isConnected: () => net.isConnected(),
    reconnectAll: () => net.heal(),
    get relays() { return new Map(net.relays); }
  };
  let relayGraceTimer = null;
  const startRelayGrace = () => {
    if (relayGraceTimer) clearTimeout(relayGraceTimer);
    state.relayGrace = true;
    relayGraceTimer = setTimeout(() => { relayGraceTimer = null; state.relayGrace = false; }, 3000);
  };
  const clearRelayGrace = () => {
    if (relayGraceTimer) { clearTimeout(relayGraceTimer); relayGraceTimer = null; }
    state.relayGrace = false;
  };
  startRelayGrace();
  // Boot is slower than the grace window on a cold load (module + relay setup
  // can pass 3s before the SDK's first render), so the window is re-armed at
  // appReady -- the point where the UI actually starts drawing -- or the banner
  // would flash just after the grace had already expired.
  const armGraceOnReady = () => {
    if (window.appReady) { startRelayGrace(); return; }
    setTimeout(armGraceOnReady, 50);
  };
  armGraceOnReady();
  net.addEventListener('relay-status', (e) => {
    const { url, status } = e.detail;
    const m = new Map(state.nostrRelayStatus || []);
    m.set(url, status);
    state.nostrRelayStatus = m;
    const anyOpen = net.isConnected();
    if (state.isConnected !== anyOpen) state.isConnected = anyOpen;
    if (anyOpen) clearRelayGrace();
    else if (!relayGraceTimer) startRelayGrace();
    if (window.ui) ui.render.all();
  });
  window.__debugNet = { get relays() { return net.status(); } };
}
