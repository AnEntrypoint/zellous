(function () {
  'use strict';

  window.__shell = {};

  const wrapDebug = () => {
    const prev = Object.getOwnPropertyDescriptor(window, '__debug');
    if (!prev || !prev.get) return false;
    Object.defineProperty(window, '__debug', {
      configurable: true,
      get() {
        const base = prev.get.call(window) || {};
        return Object.assign({}, base, { shell: window.__shell });
      },
    });
    return true;
  };

  const tryWrap = () => {
    if (wrapDebug()) return;
    if (window.appReady) { setTimeout(wrapDebug, 50); return; }
    setTimeout(tryWrap, 80);
  };
  tryWrap();
})();
