export function installPins(ww) {
  const pins = ww.pins;
  pins.addEventListener('updated', (e) => {
    const cur = state.currentChannel;
    if (cur && cur.id === e.detail.channelId && e.detail.serverId === state.currentServerId) state.channelPins = e.detail.ids;
  });
  window.nostrPins = {
    ids: (sid, ch) => pins.ids(sid, ch),
    pin: (sid, ch, mid) => pins.pin(sid, ch, mid),
    subscribe: (sid, ch) => pins.subscribe(sid, ch),
    unsubscribe: (sid, ch) => pins.unsubscribe(sid, ch)
  };
}
