import * as registry from '../modules/index.js';

export function installModules(ww) {
  registry.setContext({
    state,
    get chat() { return window.chat; },
    get forum() { return window.nostrForum; },
    get voice() { return window.lk; },
    toast: (message) => { if (window.ui && window.ui.showToast) window.ui.showToast(message, 3000, 'error'); },
  });
  window.zModules = registry;
}
