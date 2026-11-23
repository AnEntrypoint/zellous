import { registerModule } from '../registry.js';
import { effect } from '@preact/signals';
import { subscribeChannelEvents, subscribeServerEvents } from '../../events-feed.js';

const RECENT_WINDOW_MS = 3 * 3600e3;

registerModule({
  id: 'events', kind: 'service',
  setup(ctx) {
    const { S, v, call, state, hooks } = ctx;
    let stopEvents = null;
    let stopRailEvents = null;
    let railEventsKey = '';

    const watchServerEvents = () => effect(() => {
      const sid = S.currentServerId && S.currentServerId.value;
      const ids = ((S.channels && S.channels.value) || []).filter((c) => c && c.id).map((c) => c.id);
      const key = (sid || '') + '|' + ids.join(',');
      if (key === railEventsKey) return;
      railEventsKey = key;
      if (stopRailEvents) stopRailEvents();
      let cancelled = false;
      let stop = null;
      stopRailEvents = () => { cancelled = true; if (stop) stop(); };
      if (!S.serverEvents) return;
      S.serverEvents.value = { count: 0, live: false };
      subscribeServerEvents(ids, sid, (list) => {
        const now = Date.now();
        const recent = list.filter((e) => e.start > now - RECENT_WINDOW_MS);
        S.serverEvents.value = { count: recent.length, live: recent.some((e) => e.start <= now) };
      }).then((s) => { stop = s; if (cancelled) s(); });
    });
    ctx.ready.then(watchServerEvents, () => {});

    const startEvents = () => {
      if (stopEvents) stopEvents();
      stopEvents = null;
      const ch = v('currentChannel', null);
      if (S.channelEvents) S.channelEvents.value = [];
      subscribeChannelEvents(ch && ch.id, v('currentServerId', null), (list) => { if (S.channelEvents) S.channelEvents.value = list; }).then((stop) => { stopEvents = stop; });
    };
    const stopEventsFeed = () => { if (stopEvents) stopEvents(); stopEvents = null; };
    hooks.on('surface:open:events', startEvents);
    hooks.on('surface:close', stopEventsFeed);

    const findEvent = (id) => (v('channelEvents', []) || []).find((e) => e.id === id) || null;
    const failed = (label) => (e) => ctx.toast(label + ' failed: ' + ((e && e.message) || 'unknown'));

    return {
      snapshot: () => ({
        channelEvents: v('channelEvents', []).map((e) => ({ ...e, name: ctx.nameOf(e.author), mine: e.author === state.nostrPubkey, interested: e.going.includes(state.nostrPubkey) })),
        eventCount: v('serverEvents', { count: 0 }).count,
        eventLive: v('serverEvents', { live: false }).live,
      }),
      actions: {
        createEvent: (f) => call(() => {
          const ch = ctx.currentChannel();
          if (!ch || !ctx.events) return;
          return ctx.events.create(v('currentServerId', null), ch.id, { title: f.title, about: f.about, start: Math.floor(f.at / 1000) }).catch(failed('Create event'));
        }),
        rsvpEvent: (id) => call(() => {
          const ev = findEvent(id);
          if (!ev || !ctx.events) return;
          return ctx.events.rsvp(ev, !ev.going.includes(state.nostrPubkey)).catch(failed('RSVP'));
        }),
        deleteEvent: (id) => call(() => {
          const ev = findEvent(id);
          if (!ev || !ctx.events) return;
          return ctx.events.delete(ev).catch(failed('Cancel'));
        }),
      },
    };
  },
});
