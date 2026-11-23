import { signal } from '@preact/signals';
import * as registry from '../modules/index.js';
import { createReaders } from '../adapter/signals.js';
import { call } from '../adapter/call.js';

const makeHooks = () => {
  const listeners = new Map();
  return {
    on: (name, fn) => { listeners.set(name, [...(listeners.get(name) || []), fn]); },
    emit: (name, ...args) => { for (const fn of listeners.get(name) || []) fn(...args); },
  };
};

export function installModules(ww) {
  const S = window.stateSignals;
  const { v, persistBool } = createReaders(S);
  registry.setContext({
    ww,
    xstate: window.XState,
    state,
    trait: (type, name) => registry.trait(type, name),
    get chat() { return window.chat; },
    get dm() { return window.dm; },
    guard: (fn) => { try { const r = fn(); return r && r.catch ? r.catch((e) => { if (window.ui && window.ui.showToast) window.ui.showToast((e && e.message) || 'Action failed', 3500, 'error'); }) : r; } catch (e) { if (window.ui && window.ui.showToast) window.ui.showToast((e && e.message) || 'Action failed', 3500, 'error'); } },
    get forum() { return window.nostrForum; },
    get voice() { return window.lk; },
    S,
    v,
    call,
    persistBool,
    hooks: makeHooks(),
    get ready() { return window.__wireweaveReady; },
    get unread() { return window.nostrUnread; },
    get pins() { return window.nostrPins; },
    get events() { return window.nostrEvents; },
    get polls() { return window.nostrPolls; },
    get selfRoles() { return window.nostrSelfRoles; },
    get presence() { return window.nostrPresence; },
    get membership() { return window.nostrMembership; },
    get account() { return window.nostrAccount; },
    get servers() { return window.serverManager; },
    get avatarColors() { const colors = window.__zellous.helpers.AVATAR_COLORS; return Array.isArray(colors) ? colors : []; },
    get inspect() { return window.__zellous && window.__zellous.inspect; },
    nameOf: (id, fallback) => (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(id)) || (window.auth && window.auth.npubShort ? window.auth.npubShort(id) : (fallback === undefined ? String(id).slice(0, 8) : fallback)),
    currentChannel: () => { const ch = v('currentChannel', null); return ch && ch.id ? ch : null; },
    goToChannel: (name) => {
      S.gameSurface.value = null;
      const ch = v('channels', []).find((c) => c.name === name && !registry.trait(c.type, 'voice'));
      if (ch && window.ui && window.ui.actions) window.ui.actions.switchChannel(ch);
    },
    toast: (message, ms = 3000) => { if (window.ui && window.ui.showToast) window.ui.showToast(message, ms, 'error'); },
  });
  window.zModules = registry;
  registry.installModules((initial) => signal(initial));
}
