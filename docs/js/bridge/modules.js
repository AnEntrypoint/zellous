import { signal } from '@preact/signals';
import * as registry from '../modules/index.js';

export function installModules(ww) {
  registry.setContext({
    ww,
    xstate: window.XState,
    state,
    get chat() { return window.chat; },
    get dm() { return window.dm; },
    guard: (fn) => { try { const r = fn(); return r && r.catch ? r.catch((e) => { if (window.ui && window.ui.showToast) window.ui.showToast((e && e.message) || 'Action failed', 3500, 'error'); }) : r; } catch (e) { if (window.ui && window.ui.showToast) window.ui.showToast((e && e.message) || 'Action failed', 3500, 'error'); } },
    get forum() { return window.nostrForum; },
    get voice() { return window.lk; },
    toast: (message) => { if (window.ui && window.ui.showToast) window.ui.showToast(message, 3000, 'error'); },
  });
  window.zModules = registry;
  registry.installModules((initial) => signal(initial));
}
