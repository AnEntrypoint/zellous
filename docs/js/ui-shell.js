(function () {
  'use strict';

  window.__shell = {};

  (function wireDrawerSwipe() {
    const EDGE_PX = 24, TRIGGER_PX = 60, MAX_DRIFT_PX = 45;
    const narrow = () => window.matchMedia('(max-width: 900px)').matches;
    const drawerOpen = () => !!(window.stateSignals && window.stateSignals.mobileMenuOpen.value);
    let start = null;
    document.addEventListener('touchstart', (e) => {
      if (!narrow() || e.touches.length !== 1) { start = null; return; }
      const t = e.touches[0];
      const fromEdge = t.clientX <= EDGE_PX && !drawerOpen();
      start = fromEdge || drawerOpen() ? { x: t.clientX, y: t.clientY, open: drawerOpen(), done: false } : null;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (!start || start.done) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x, dy = Math.abs(t.clientY - start.y);
      if (dy > MAX_DRIFT_PX) { start = null; return; }
      if (!start.open && dx >= TRIGGER_PX) { start.done = true; window.ui?.actions?.openMobileMenu?.(); }
      else if (start.open && dx <= -TRIGGER_PX) { start.done = true; window.ui?.actions?.closeMobileMenu?.(); }
    }, { passive: true });
    document.addEventListener('touchend', () => { start = null; }, { passive: true });
    document.addEventListener('touchcancel', () => { start = null; }, { passive: true });
  })();

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
