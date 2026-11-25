export const SIGNALS = ['pref_devtraffic', 'devTick', 'pref_devevents', 'pref_devinspect', 'devEventFilter', 'presenceVersion', 'accountVersion', 'setupOpen', 'setupFocus', 'setupVersion', 'profileLink', 'accountNote', 'typingVersion', 'serverEvents', 'voiceVideos', 'chatSearch', 'savedVersion', 'dmReadVersion', 'inboxTab', 'mutedChannels', 'pref_compact', 'pref_h24', 'pref_motion', 'pref_ulinks', 'pref_embeds', 'pref_jumbo', 'pref_spoilers', 'pref_vcsounds', 'pref_sbsounds', 'pref_mentionsonly', 'pref_devmode', 'channels', 'channelEvents', 'splitChannel', 'splitMessages', 'categories', 'servers', 'deletedServers', 'currentChannel', 'currentServerId', 'chatMessages', 'channelPins', 'pollVotesVersion', 'selfRolesVersion', 'gamePrefTab', 'pref_kw', 'pref_banner', 'messages', 'chatInputValue', 'currentUser', 'authVersion', 'isConnected', 'voiceConnected', 'voiceChannelName', 'voiceConnectionState', 'voiceParticipants', 'voiceSpeaking', 'micMuted', 'voiceDeafened', 'showAuthModal', 'authMode', 'authError', 'authBusy', 'settingsOpen', 'gamePrefOpen', 'gameServerCreateOpen', 'gameSurface', 'voiceSettingsOpen', 'vadEnabled', 'inputDeviceId', 'outputDeviceId', 'inputDevices', 'outputDevices', 'vadThreshold', 'rnnoiseEnabled', 'autoGainEnabled', 'forceTurnEnabled', 'voiceBitrate', 'masterVolume', 'replyTarget', 'threadPanelOpen', 'activeThreadId', 'threads', 'pagesVersion', 'mutesVersion', 'rolesVersion', 'forumVersion', 'relayGrace', 'reactionsVersion', 'profilesVersion', 'unreadVersion', 'voiceListenOnly', 'dmMessages', 'activeDmPeer', 'themePref', 'notificationsEnabled', 'messagePreviewEnabled', 'soundEnabled', 'mobileMenuOpen', 'memberListOpen', 'pttState', 'roomMembers', 'audioQueueItems', 'audioQueueCurrentId', 'audioQueuePaused'];

export function createReaders(S) {
  const v = (name, fallback) => {
    const entry = S[name];
    if (entry !== null && typeof entry === 'object' && 'value' in entry) return entry.value;
    return entry === undefined || entry === null ? fallback : entry;
  };
  const persistBool = (signalName, key, val) => {
    if (S[signalName]) S[signalName].value = !!val;
    try { localStorage.setItem(key, val ? '1' : '0'); } catch (_) {}
  };
  return { v, persistBool };
}

const MIN_RENDER_GAP_MS = 16;

export function makeSubscribe(S, effect, extra = () => []) {
  return (cb) => {
    let lastRenderAt = -Infinity;
    let frameQueued = false;
    const queueFrame = () => {
      if (frameQueued) return;
      frameQueued = true;
      const run = () => { frameQueued = false; S.renderTick.value += 1; };
      if (document.hidden) setTimeout(run, 250); else requestAnimationFrame(run);
    };
    return effect(() => {
      for (const n of SIGNALS) { if (S[n]) void S[n].value; }
      for (const sig of extra()) void sig.value;
      void S.renderTick.value;
      const now = performance.now();
      if (now - lastRenderAt < MIN_RENDER_GAP_MS) { queueFrame(); return; }
      lastRenderAt = now;
      cb();
    });
  };
}
