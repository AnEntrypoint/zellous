export function installEvents(ww) {
  const events = ww.events;
  window.nostrEvents = {
    create: (sid, ch, fields) => events.create(sid, ch, fields)
  };
}
