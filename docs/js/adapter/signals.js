export const SIGNALS = ['channels', 'categories', 'servers', 'currentChannel', 'currentServerId', 'chatMessages', 'messages', 'chatInputValue', 'currentUser', 'authVersion', 'isConnected', 'voiceConnected', 'voiceChannelName', 'voiceConnectionState', 'voiceParticipants', 'micMuted', 'voiceDeafened', 'micRawLevel', 'showAuthModal', 'authMode', 'authError', 'authBusy', 'settingsOpen', 'voiceSettingsOpen', 'vadEnabled', 'inputDeviceId', 'outputDeviceId', 'inputDevices', 'outputDevices', 'vadThreshold', 'rnnoiseEnabled', 'autoGainEnabled', 'forceTurnEnabled', 'voiceBitrate', 'masterVolume', 'replyTarget', 'threadPanelOpen', 'activeThreadId', 'threads', 'pagesVersion', 'forumVersion', 'relayGrace', 'reactionsVersion', 'profilesVersion', 'unreadVersion', 'voiceListenOnly', 'dmMessages', 'activeDmPeer', 'themePref', 'notificationsEnabled', 'messagePreviewEnabled', 'soundEnabled', 'mobileMenuOpen', 'memberListOpen', 'pttState', 'roomMembers', 'audioQueueItems', 'audioQueueCurrentId', 'audioQueuePaused'];

export function createReaders(S) {
  const v = (name, fallback) => (S[name] && 'value' in S[name]) ? S[name].value : fallback;
  const persistBool = (signalName, key, val) => {
    if (S[signalName]) S[signalName].value = !!val;
    try { localStorage.setItem(key, val ? '1' : '0'); } catch (_) {}
  };
  return { v, persistBool };
}

export function makeSubscribe(S, effect) {
  return (cb) => effect(() => { for (const n of SIGNALS) { if (S[n]) void S[n].value; } cb(); });
}
