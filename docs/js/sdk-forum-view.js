(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.ForumView) { setTimeout(init, 30); return; }
    const forum = document.getElementById('forumView');
    if (!forum) return;
    let host = document.getElementById('sdkForumViewHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sdkForumViewHost';
      host.style.display = 'none';
      forum.parentNode.insertBefore(host, forum.nextSibling);
    }
    const { applyDiff, C } = sdk;

    let query = '';
    let sortBy = 'recent';

    function currentPosts() {
      const tm = window.threadManager;
      const chId = state.currentChannel?.id;
      if (!tm || !chId) return [];
      let list = (tm._threads?.get(chId) || []).map(t => ({
        id: t.id,
        title: t.name || t.title || '(untitled)',
        author: t.authorName || '',
        time: t.createdAt || t.lastActivity || 0,
        replyCount: t.messageCount || 0,
        snippet: t.lastMessage || '',
        tags: t.tags || []
      }));
      if (query) {
        const q = query.toLowerCase();
        list = list.filter(p => (p.title + ' ' + p.snippet).toLowerCase().includes(q));
      }
      if (sortBy === 'popular') list.sort((a, b) => (b.replyCount || 0) - (a.replyCount || 0));
      else if (sortBy === 'unanswered') list = list.filter(p => !p.replyCount);
      else list.sort((a, b) => (b.time || 0) - (a.time || 0));
      return list;
    }

    function syncVisibility() {
      const legacyVisible = forum.style.display !== 'none';
      host.style.display = legacyVisible ? 'flex' : 'none';
      host.style.flexDirection = 'column';
      host.style.flex = '1';
    }

    function view() {
      return C.ForumView({
        posts: currentPosts(),
        query,
        sortBy,
        onSearch: (v) => { query = v; render(); },
        onSort: (v) => { sortBy = v; render(); },
        onSelect: (id) => {
          const ch = state.channels.find(c => c.id === id);
          if (ch && window.ui?.actions?.switchChannel) ui.actions.switchChannel(ch);
        },
        onNewPost: () => {
          const ch = state.currentChannel;
          if (window.channelManager) channelManager.showCreateModal('thread', ch?.categoryId || null);
        }
      });
    }

    function render() { syncVisibility(); applyDiff(host, view()); }

    const mo = new MutationObserver(render);
    mo.observe(forum, { attributes: true, attributeFilter: ['style', 'class'] });

    effect(() => {
      window.stateSignals.currentChannel?.value;
      window.stateSignals.channels?.value;
      render();
    });

    render();
  }
  init();
})();
