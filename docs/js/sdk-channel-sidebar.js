(function () {
  const HOME_CAT_ID = '__home__';
  const HOME_CH_ID = '__home_self__';
  const PAGES_CAT_ID = '__pages__';
  const UNCAT_ID = 'uncategorized';

  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !window.channelManager) {
      setTimeout(init, 30);
      return;
    }
    const host = document.getElementById('channelSidebar');
    if (!host) return;

    const { applyDiff, C } = sdk;
    host.innerHTML = '';

    function avatarColor(id) {
      return (window.getAvatarColor && window.getAvatarColor(id)) || 'var(--accent)';
    }

    function buildHome() {
      const user = state.currentUser || window.auth?.user;
      const name = user?.displayName || user?.username || 'You';
      return {
        serverName: 'Direct Messages',
        categories: [{ id: HOME_CAT_ID, name: 'Direct Messages', position: 0 }],
        channels: [{ id: HOME_CH_ID, name: name, type: 'text', categoryId: HOME_CAT_ID, position: 0 }],
        activeId: HOME_CH_ID
      };
    }

    function channelActions(chId) {
      return [
        {
          id: 'invite',
          title: 'Invite',
          icon: window.getIcon ? window.getIcon('invite') : '✉',
          onClick: () => {
            if (!state.currentServerId) return;
            const url = location.origin + location.pathname + '?room=' + encodeURIComponent(state.currentServerId);
            try { navigator.clipboard.writeText(url); } catch (_) {}
            if (window.ui?.showToast) window.ui.showToast('Invite link copied!');
          }
        },
        {
          id: 'settings',
          title: 'Settings',
          icon: window.getIcon ? window.getIcon('settings') : '⚙',
          onClick: () => {
            try { window.channelManager?.showContextMenu(chId, 0, 0); } catch (e) {}
          }
        }
      ];
    }

    function buildServer() {
      const rawChannels = state.channels || [];
      const rawCats = state.categories || [];
      const current = state.currentChannel || { id: 'general' };
      const voiceCh = state.voiceChannelName;
      const voiceConnected = state.voiceConnected;
      const voiceConnState = state.voiceConnectionState;
      const participants = state.voiceParticipants || [];
      const speakers = state.activeSpeakers || new Set();

      const sortedCats = [...rawCats].sort((a, b) => (a.position || 0) - (b.position || 0));
      const categories = sortedCats.map(c => ({ id: c.id, name: c.name, position: c.position || 0 }));

      const hasUncat = rawChannels.some(c => !c.categoryId || !rawCats.find(k => k.id === c.categoryId));
      if (hasUncat) categories.push({ id: UNCAT_ID, name: 'CHANNELS', position: 9998 });

      const channels = rawChannels.map(c => {
        const catId = (c.categoryId && rawCats.find(k => k.id === c.categoryId)) ? c.categoryId : UNCAT_ID;
        const isVoiceConn = c.type === 'voice' && voiceConnected && voiceCh === c.name;
        const isVoiceConnecting = c.type === 'voice' && voiceConnState === 'connecting' && voiceCh === c.name;
        const out = {
          id: c.id,
          name: c.name,
          type: c.type,
          categoryId: catId,
          position: c.position || 0,
          draggable: true,
          voiceActive: !!isVoiceConn,
          voiceConnecting: !!isVoiceConnecting,
          actions: channelActions(c.id)
        };
        if (isVoiceConn) {
          out.participants = participants.map(p => ({
            identity: p.identity,
            speaking: speakers.has(p.identity),
            color: avatarColor(p.identity)
          }));
        }
        return out;
      });

      if (window.serverPages && state.currentServerId) {
        const pages = window.serverPages.getPages(state.currentServerId) || [];
        const isAdmin = !!(window.serverRoles && window.serverRoles.isAdmin(state.currentServerId));
        if (pages.length > 0 || isAdmin) {
          categories.push({
            id: PAGES_CAT_ID,
            name: 'PAGES',
            position: 9999,
            extraButton: isAdmin ? {
              title: 'New Page',
              icon: '+',
              onClick: () => { try { window.serverPages.showEditModal(state.currentServerId, null); } catch (e) {} }
            } : null
          });
          pages.forEach((p, i) => {
            channels.push({
              id: 'page:' + p.slug,
              name: p.title,
              type: 'page',
              categoryId: PAGES_CAT_ID,
              position: i,
              _pageSlug: p.slug
            });
          });
        }
      }

      return {
        serverName: '',
        categories,
        channels,
        activeId: current.id
      };
    }

    function userPanelProps() {
      const user = state.currentUser || window.auth?.user || {};
      const name = user.displayName || user.username || 'Connecting...';
      const npub = state.nostrPubkey ? (window.auth?.npubShort?.(state.nostrPubkey) || state.nostrPubkey.slice(0, 12) + '…') : '';
      const theme = (document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'dark');
      return {
        name,
        tag: npub,
        color: avatarColor(state.nostrPubkey || name),
        muted: !!state.micMuted,
        deafened: !!state.voiceDeafened,
        extraButtons: [
          {
            title: theme === 'dark' ? 'Light theme' : 'Dark theme',
            icon: theme === 'dark' ? '☀' : '☾',
            onClick: () => {
              const next = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
              document.documentElement.setAttribute('data-theme', next);
              try { localStorage.setItem('theme', next); } catch (_) {}
              if (window.stateSignals?.currentChannel) {
                const cur = window.stateSignals.currentChannel.value;
                window.stateSignals.currentChannel.value = cur ? { ...cur } : cur;
              }
            }
          }
        ],
        onMute: () => { if (window.lk?.toggleMic) window.lk.toggleMic(); else state.micMuted = !state.micMuted; },
        onDeafen: () => { if (window.lk?.toggleDeafen) window.lk.toggleDeafen(); else state.voiceDeafened = !state.voiceDeafened; },
        onSettings: () => {
          if (typeof window.openSettings === 'function') window.openSettings();
          else document.getElementById('settingsBtn')?.click();
        }
      };
    }

    function view() {
      const base = state.homeMode ? buildHome() : buildServer();
      return C.ChannelSidebar({
        serverName: base.serverName,
        channels: base.channels,
        categories: base.categories,
        activeId: base.activeId,
        collapsedCats: state.collapsedCategories || new Set(),
        userPanelProps: userPanelProps(),
        onChannelClick: (chId) => {
          if (state.homeMode || chId === HOME_CH_ID) return;
          if (typeof chId === 'string' && chId.indexOf('page:') === 0) {
            const slug = chId.slice(5);
            const pages = (window.serverPages && state.currentServerId) ? window.serverPages.getPages(state.currentServerId) : [];
            const page = pages.find(p => p.slug === slug);
            state.currentChannel = {
              id: chId,
              name: page ? page.title : slug,
              type: 'page',
              _serverId: state.currentServerId,
              _slug: slug
            };
            if (window.uiChannels?.renderView) window.uiChannels.renderView();
            return;
          }
          const ch = (state.channels || []).find(c => c.id === chId);
          if (ch && window.ui?.actions?.switchChannel) window.ui.actions.switchChannel(ch);
        },
        onCategoryToggle: (catId) => {
          if (catId === UNCAT_ID || catId === PAGES_CAT_ID || catId === HOME_CAT_ID) return;
          const col = new Set(state.collapsedCategories || []);
          col.has(catId) ? col.delete(catId) : col.add(catId);
          state.collapsedCategories = col;
        },
        onAddChannel: (catId) => {
          if (!window.channelManager) return;
          if (catId === UNCAT_ID || !catId) window.channelManager.showCreateModal(null, null);
          else window.channelManager.showCreateModal(null, catId);
        },
        onChannelContext: (chId, x, y) => {
          if (state.homeMode) return;
          if (typeof chId === 'string' && chId.indexOf('page:') === 0) return;
          window.channelManager?.showContextMenu(chId, x || 0, y || 0);
        }
      });
    }

    function render() { applyDiff(host, view()); }

    effect(() => {
      window.stateSignals.channels.value;
      window.stateSignals.categories.value;
      window.stateSignals.currentChannel.value;
      window.stateSignals.collapsedCategories.value;
      window.stateSignals.voiceConnected.value;
      window.stateSignals.voiceChannelName.value;
      window.stateSignals.voiceConnectionState.value;
      window.stateSignals.voiceParticipants.value;
      window.stateSignals.activeSpeakers.value;
      window.stateSignals.currentServerId.value;
      window.stateSignals.currentUser.value;
      window.stateSignals.micMuted.value;
      window.stateSignals.voiceDeafened.value;
      render();
    });

    if (window.uiChannels) {
      window.uiChannels.render = function () {};
      window.uiChannels.renderHome = function () { if (window.uiChannels._renderHomeView) window.uiChannels._renderHomeView(); };
    }
  }
  init();
})();
