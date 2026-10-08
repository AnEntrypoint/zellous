// Voice channel view, PTT/VAD controls, voice settings modal and the voice-message queue.
export function buildVoice({ v, S, call }) {
  // Voice Settings changes apply eagerly (the modal reads straight off the
  // live signals), so Cancel can only be honest if the pre-open state is
  // captured here and re-applied -- including the localStorage writes and
  // the live session calls applyVoicePatch makes.
  let voiceSettingsSnapshot = null;
  const snapshotVoiceSettings = () => ({
    mode: v('vadEnabled', false) ? 'vad' : 'ptt',
    inputId: v('inputDeviceId', null),
    outputId: v('outputDeviceId', null),
    vadThreshold: v('vadThreshold', 0.15),
    rnnoise: v('rnnoiseEnabled', true),
    autoGain: v('autoGainEnabled', true),
    forceTurn: v('forceTurnEnabled', false),
    bitrate: v('voiceBitrate', 64),
    volume: v('masterVolume', 0.7),
  });
  const applyVoicePatch = (patch) => {
    if ('mode' in patch && S.vadEnabled) S.vadEnabled.value = patch.mode === 'vad';
    if ('inputId' in patch && S.inputDeviceId) S.inputDeviceId.value = patch.inputId;
    if ('outputId' in patch && S.outputDeviceId) S.outputDeviceId.value = patch.outputId;
    if ('vadThreshold' in patch && S.vadThreshold) {
      S.vadThreshold.value = patch.vadThreshold;
      try { localStorage.setItem('vadThreshold', String(patch.vadThreshold)); } catch (_) {}
      // setMicSensitivity takes a raw RMS; patch.vadThreshold is the UI's 0-1
      // fraction -- scale by the same LEVEL_METER_CEILING wireweave-bridge.js
      // uses at connect() so a live mid-call change matches the same mapping.
      if (window.lk && window.lk.setMicSensitivity) window.lk.setMicSensitivity(Math.max(0, Math.min(1, patch.vadThreshold)) * 0.35);
    }
    if ('rnnoise' in patch) { if (S.rnnoiseEnabled) S.rnnoiseEnabled.value = patch.rnnoise; try { localStorage.setItem('rnnoise', patch.rnnoise ? '1' : '0'); } catch (_) {} }
    if ('autoGain' in patch) { if (S.autoGainEnabled) S.autoGainEnabled.value = patch.autoGain; try { localStorage.setItem('autoGain', patch.autoGain ? '1' : '0'); } catch (_) {} }
    if ('forceTurn' in patch) {
      if (S.forceTurnEnabled) S.forceTurnEnabled.value = patch.forceTurn;
      try { localStorage.setItem('forceRelay', patch.forceTurn ? '1' : '0'); } catch (_) {}
      if (window.lk && window.lk.setForceRelay) window.lk.setForceRelay(!!patch.forceTurn);
    }
    if ('bitrate' in patch && S.voiceBitrate) {
      S.voiceBitrate.value = patch.bitrate;
      try { localStorage.setItem('voiceBitrate', String(patch.bitrate)); } catch (_) {}
      if (window.lk && window.lk.setAudioBitrate) window.lk.setAudioBitrate(patch.bitrate);
    }
    // SDK's VoiceSettingsModal sends the master-volume slider's patch as
    // {volume: n} (matches its own `volume:S.masterVolume` prop name) --
    // this key previously went unhandled, so S.masterVolume never updated
    // and the slider had zero effect on realtime peer audio or queued
    // voice-message playback (both read state.masterVolume live).
    if ('volume' in patch && S.masterVolume) {
      S.masterVolume.value = patch.volume;
      try { localStorage.setItem('masterVolume', String(patch.volume)); } catch (_) {}
    }
    if (('outputId' in patch || 'volume' in patch) && window.lk && window.lk.applyOutputSettings) window.lk.applyOutputSettings();
    if (window.lk && window.lk.setAudioConstraints) window.lk.setAudioConstraints({ deviceId: v('inputDeviceId', null), noiseSuppression: v('rnnoiseEnabled', true), autoGainControl: v('autoGainEnabled', true) });
  };

  return {
    snapshot: () => ({
      voiceConnected: v('voiceConnected', false),
      voiceChannelName: v('voiceChannelName', ''),
      voiceConnectionState: v('voiceConnectionState', 'connected'),
      voiceParticipants: v('voiceParticipants', []).map(p => ({ ...p, speaking: !!p.isSpeaking, color: (window.getAvatarColor && window.getAvatarColor(p.isLocal ? (window.state.userId || window.state.nostrPubkey) : p.identity)) || 'var(--accent)' })),
      voiceListenOnly: v('voiceListenOnly', false),
      micMuted: v('micMuted', false),
      voiceDeafened: v('voiceDeafened', false),
      micRawLevel: v('micRawLevel', 0),
      voiceSettingsOpen: v('voiceSettingsOpen', false),
      voiceMode: v('vadEnabled', false) ? 'vad' : 'ptt',
      // Drives the SDK's own .vx-ptt button (mountCommunityApp's voice view) —
      // voice-ptt.js does the real requestTransmit/releaseTransmit gating and
      // publishes its live state as window.state.pttState, not DOM.
      pttUiMode: v('vadEnabled', false) ? 'vad' : 'ptt',
      isSpeaking: v('pttState', 'idle') === 'live',
      inputDeviceId: v('inputDeviceId', null),
      outputDeviceId: v('outputDeviceId', null),
      inputDevices: v('inputDevices', []),
      outputDevices: v('outputDevices', []),
      vadThreshold: v('vadThreshold', 0.15),
      rnnoiseEnabled: v('rnnoiseEnabled', true),
      autoGainEnabled: v('autoGainEnabled', true),
      forceTurnEnabled: v('forceTurnEnabled', false),
      voiceBitrate: v('voiceBitrate', 64),
      masterVolume: v('masterVolume', 0.7),
      // pttGate's inboundQueue is the real, live-populated voice-message queue
      // (data-channel segments, voice-ptt.js) -- state.audioQueue/queue.js is a
      // dead parallel pipeline (websocket-era chunk assembly with zero live
      // callers into addSegment/addChunk/completeSegment) kept only for its
      // still-reachable replay/download-of-a-completed-segment helpers.
      audioQueueItems: v('audioQueueItems', []),
      audioQueueCurrentId: v('audioQueueCurrentId', null),
      audioQueuePaused: v('audioQueuePaused', false),
    }),
    actions: {
      toggleMic: () => call(() => (window.lk && window.lk.toggleMic) ? window.lk.toggleMic() : (window.state.micMuted = !window.state.micMuted)),
      toggleDeafen: () => call(() => (window.lk && window.lk.toggleDeafen) ? window.lk.toggleDeafen() : (window.state.voiceDeafened = !window.state.voiceDeafened)),
      pttStart: () => call(() => window.__zellous && window.__zellous.pttGate && window.__zellous.pttGate.holdStart()),
      pttStop: () => call(() => window.__zellous && window.__zellous.pttGate && window.__zellous.pttGate.holdEnd()),
      leaveVoice: () => call(() => (window.lk && window.lk.disconnect) ? window.lk.disconnect() : (window.voice && window.voice.leave && window.voice.leave())),
      returnToVoice: () => call(() => {
        const name = v('voiceChannelName', '');
        const ch = (window.state.channels || []).find(c => c.type === 'voice' && c.name === name);
        if (ch) window.ui.actions.switchChannel(ch);
      }),
      openVoiceSettings: () => call(() => {
        voiceSettingsSnapshot = snapshotVoiceSettings();
        if (S.voiceSettingsOpen) S.voiceSettingsOpen.value = true;
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          navigator.mediaDevices.enumerateDevices().then((devices) => {
            const withDefault = (list) => list.length ? list : [{ value: '', label: 'System default' }];
            if (S.inputDevices) S.inputDevices.value = withDefault(devices.filter(d => d.kind === 'audioinput').map(d => ({ value: d.deviceId, label: d.label || 'Microphone' })));
            if (S.outputDevices) S.outputDevices.value = withDefault(devices.filter(d => d.kind === 'audiooutput').map(d => ({ value: d.deviceId, label: d.label || 'Speaker' })));
          }).catch((e) => { if (window.ui?.showToast) window.ui.showToast('Could not list audio devices: ' + (e?.message || 'unknown error'), 'error'); });
        }
      }),
      voiceSettingsChange: (patch) => call(() => applyVoicePatch(patch || {})),
      voiceSettingsSave: () => call(() => {
        voiceSettingsSnapshot = null;
        if (S.voiceSettingsOpen) S.voiceSettingsOpen.value = false;
      }),
      voiceSettingsClose: () => call(() => {
        const snapshot = voiceSettingsSnapshot;
        voiceSettingsSnapshot = null;
        if (snapshot) applyVoicePatch(snapshot);
        if (S.voiceSettingsOpen) S.voiceSettingsOpen.value = false;
      }),
      // Routed through pttGate (voice-ptt.js), the queue that's actually
      // populated live off inbound data-channel segments -- window.queue
      // (queue.js) is a parallel pipeline nothing ever feeds real segments
      // into (see audioQueueItems above), so its own replaySegment/
      // pausePlayback/resumePlayback are unreachable from any real message.
      replaySegment: (id) => call(() => window.__zellous?.pttGate?.replaySegment(id)),
      skipSegment: () => call(() => window.__zellous?.pttGate?.skipQueue()),
      pauseQueue: () => call(() => window.__zellous?.pttGate?.pauseQueue()),
      resumeQueue: () => call(() => window.__zellous?.pttGate?.resumeQueue()),
    },
  };
}
