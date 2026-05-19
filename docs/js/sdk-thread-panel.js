(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.ThreadPanel) { setTimeout(init, 30); return; }
    const panel = document.getElementById('threadPanel');
    if (!panel) return;
    let host = document.getElementById('sdkThreadPanelHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sdkThreadPanelHost';
      panel.appendChild(host);
    }
    const { applyDiff, C } = sdk;

    function currentThreads() {
      const tm = window.threadManager;
      const chId = state.currentChannel?.id;
      if (!tm || !chId) return [];
      const list = tm._threads?.get(chId) || [];
      return list.map(t => ({
        id: t.id,
        title: t.name || t.title || '(untitled)',
        lastMessage: t.lastMessage || '',
        unread: !!t.unread,
        author: t.authorName || '',
        time: t.lastActivity || t.createdAt || 0
      }));
    }

    function view() {
      const open = panel.classList.contains('open');
      return C.ThreadPanel({
        threads: currentThreads(),
        activeId: state.currentChannel?.id,
        open,
        title: 'Threads',
        onSelect: (id) => {
          const ch = state.channels.find(c => c.id === id);
          if (ch && window.ui?.actions?.switchChannel) ui.actions.switchChannel(ch);
        },
        onCreate: () => {
          const ch = state.currentChannel;
          if (window.channelManager) channelManager.showCreateModal('thread', ch?.categoryId || null);
        },
        onClose: () => { panel.classList.remove('open'); render(); }
      });
    }

    function render() { applyDiff(host, view()); }

    const mo = new MutationObserver(render);
    mo.observe(panel, { attributes: true, attributeFilter: ['class'] });

    effect(() => {
      window.stateSignals.currentChannel?.value;
      window.stateSignals.channels?.value;
      render();
    });

    const origSet = window.threadManager?.setThreads;
    const origAdd = window.threadManager?.addThread;
    const origUpd = window.threadManager?.updateFromChannels;
    if (window.threadManager && origSet) {
      window.threadManager.setThreads = function () { const r = origSet.apply(this, arguments); render(); return r; };
      window.threadManager.addThread = function () { const r = origAdd.apply(this, arguments); render(); return r; };
      window.threadManager.updateFromChannels = function () { const r = origUpd.apply(this, arguments); render(); return r; };
    }

    render();
  }
  init();
})();
