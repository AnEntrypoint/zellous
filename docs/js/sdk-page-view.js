(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.PageView) { setTimeout(init, 30); return; }
    const pv = document.getElementById('pageView');
    if (!pv) return;
    let host = document.getElementById('sdkPageViewHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sdkPageViewHost';
      host.style.display = 'none';
      host.style.flex = '1';
      host.style.overflowY = 'auto';
      pv.parentNode.insertBefore(host, pv.nextSibling);
    }
    const { applyDiff, C } = sdk;

    function getCurrentPage() {
      const ch = state.currentChannel;
      if (!ch || ch.type !== 'page') return null;
      const sp = window.serverPages;
      if (!sp || !ch._serverId || !ch._slug) return null;
      try {
        const pages = sp.getPages ? sp.getPages(ch._serverId) : null;
        if (!pages) return null;
        const page = pages.find ? pages.find(p => p.slug === ch._slug) : (pages.get ? pages.get(ch._slug) : null);
        if (!page) return null;
        return {
          title: page.title || ch.name || '',
          html: page.html || page.content || '',
          isAdmin: !!(window.serverPages?.canEdit?.(ch._serverId) ?? true)
        };
      } catch { return null; }
    }

    function syncVisibility() {
      const legacyVisible = pv.style.display !== 'none';
      host.style.display = legacyVisible ? 'block' : 'none';
    }

    function view() {
      const data = getCurrentPage();
      if (!data) return null;
      return C.PageView({
        title: data.title,
        html: data.html,
        isAdmin: data.isAdmin,
        onEdit: () => {
          const ch = state.currentChannel;
          if (window.serverPages?.showEditModal && ch?._serverId) {
            window.serverPages.showEditModal(ch._serverId, ch._slug);
          }
        }
      });
    }

    function render() {
      syncVisibility();
      const v = view();
      if (v) applyDiff(host, v);
    }

    const mo = new MutationObserver(render);
    mo.observe(pv, { attributes: true, attributeFilter: ['style', 'class'], childList: true, subtree: false });

    effect(() => {
      window.stateSignals.currentChannel?.value;
      render();
    });

    render();
  }
  init();
})();
