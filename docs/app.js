const audioIO = {
  init: async () => {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: config.sampleRate });
    await audioIO.enumerateDevices();
    await audioIO.selectInput(state.inputDeviceId);
  },
  enumerateDevices: async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = [ui.inputDevice, document.getElementById('settingsInputDevice')].filter(Boolean);
    const outputs = [ui.outputDevice, document.getElementById('settingsOutputDevice')].filter(Boolean);
    inputs.forEach(el => { el.innerHTML = ''; });
    outputs.forEach(el => { el.innerHTML = ''; });
    devices.forEach(d => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `${d.kind} (${d.deviceId.slice(0, 8)})`;
      if (d.kind === 'audioinput') inputs.forEach(el => el.appendChild(o.cloneNode(true)));
      if (d.kind === 'audiooutput') outputs.forEach(el => el.appendChild(o.cloneNode(true)));
    });
    if (state.inputDeviceId) inputs.forEach(el => { el.value = state.inputDeviceId; });
    if (state.outputDeviceId) outputs.forEach(el => { el.value = state.outputDeviceId; });
  },
  selectInput: async (deviceId) => {
    if (state.mediaStream) state.mediaStream.getTracks().forEach(t => t.stop());
    try {
      const c = { audio: { echoCancellation: true, noiseSuppression: true } };
      if (deviceId) c.audio.deviceId = { exact: deviceId };
      state.mediaStream = await navigator.mediaDevices.getUserMedia(c);
      state.inputDeviceId = deviceId || state.mediaStream.getAudioTracks()[0]?.getSettings()?.deviceId;
      await audioIO.setupRecording();
      await audioIO.enumerateDevices();
    } catch (e) { console.warn('Microphone denied'); }
  },
  selectOutput: async (deviceId) => {
    state.outputDeviceId = deviceId;
    if (state.audioContext.destination.setSinkId) await state.audioContext.destination.setSinkId(deviceId);
  },
  setupRecording: async () => {
    audio.initEncoder();
    if (state.workletNode) { try { state.workletNode.disconnect(); } catch (e) {} }
    await state.audioContext.resume();
    const processorUrl = new URL('js/audio-processor.js', document.baseURI).href;
    await state.audioContext.audioWorklet.addModule(processorUrl);
    const source = state.audioContext.createMediaStreamSource(state.mediaStream);
    const worklet = new AudioWorkletNode(state.audioContext, 'audio-capture', { processorOptions: { chunkSize: config.chunkSize } });
    worklet.port.onmessage = (e) => {
      if (state.isSpeaking && state.audioEncoder) {
        const samples = e.data;
        const d = new AudioData({ format: 'f32-planar', sampleRate: config.sampleRate, numberOfFrames: samples.length, numberOfChannels: 1, timestamp: performance.now() * 1000, data: samples });
        state.audioEncoder.encode(d); d.close();
      }
    };
    source.connect(worklet);
    state.workletNode = worklet;
  }
};

const ui_events = {
  setup: () => {
    const resume = () => { if (state.audioContext?.state === 'suspended') state.audioContext.resume(); };
    document.addEventListener('click', resume, { once: false });
    document.addEventListener('touchstart', resume, { once: false });
    if (ui.ptt) {
      ui.ptt.addEventListener('mousedown', () => { if (!state.vadEnabled) ptt.start(); });
      ui.ptt.addEventListener('mouseup', () => { if (!state.vadEnabled) ptt.stop(); });
      ui.ptt.addEventListener('touchstart', (e) => { e.preventDefault(); if (!state.vadEnabled) ptt.start(); });
      ui.ptt.addEventListener('touchend', () => { if (!state.vadEnabled) ptt.stop(); });
      ui.ptt.addEventListener('touchcancel', () => { if (!state.vadEnabled) ptt.stop(); });
    }
    const syncVol = (v) => {
      state.masterVolume = v / 100;
      state.audioSources.forEach(s => s.gainNode.gain.value = state.masterVolume);
      if (ui.volumeSlider) ui.volumeSlider.value = v;
      if (ui.volumeValue) ui.volumeValue.textContent = v + '%';
      const sv = document.getElementById('settingsVolume'); if (sv) sv.value = v;
      const svv = document.getElementById('settingsVolValue'); if (svv) svv.textContent = v + '%';
    };
    ui.volumeSlider?.addEventListener('input', (e) => syncVol(e.target.value));
    document.getElementById('settingsVolume')?.addEventListener('input', (e) => syncVol(e.target.value));
    ui.deafenBtn?.addEventListener('click', deafen.toggle);
    ui.vadBtn?.addEventListener('click', vad.toggle);
    ui.vadThreshold?.addEventListener('input', (e) => { vad.setThreshold(e.target.value); ui.vadValue.textContent = e.target.value + '%'; });
    ui.webcamBtn?.addEventListener('click', () => { webcam.toggle(); setTimeout(() => { ui.webcamControls.classList.toggle('hidden', !state.webcamEnabled); }, 100); });
    ui.webcamResolution?.addEventListener('change', (e) => { state.webcamResolution = e.target.value; if (state.webcamEnabled) { webcam.disable(); webcam.enable(); } });
    ui.webcamFps?.addEventListener('change', (e) => { state.webcamFps = parseInt(e.target.value); if (state.webcamEnabled) { webcam.disable(); webcam.enable(); } });
    ui.inputDevice?.addEventListener('change', (e) => audioIO.selectInput(e.target.value));
    ui.outputDevice?.addEventListener('change', (e) => audioIO.selectOutput(e.target.value));
    document.getElementById('settingsInputDevice')?.addEventListener('change', (e) => audioIO.selectInput(e.target.value));
    document.getElementById('settingsOutputDevice')?.addEventListener('change', (e) => audioIO.selectOutput(e.target.value));
    ui.chatInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ui.actions.sendChat(); } });
    document.getElementById('sendBtn')?.addEventListener('click', () => ui.actions.sendChat());
    document.getElementById('attachBtn')?.addEventListener('click', () => ui.actions.uploadFile());
    ui.fileInput?.addEventListener('change', (e) => ui.actions.handleFileSelect(e));
    document.addEventListener('paste', (e) => { if (document.activeElement === ui.chatInput && window.fileTransfer?.uploadFromClipboard) fileTransfer.uploadFromClipboard(e); });
    document.body.addEventListener('dragover', (e) => e.preventDefault());
    document.body.addEventListener('drop', (e) => { if (window.fileTransfer?.handleDrop) fileTransfer.handleDrop(e); });
    const _tab = (show, hide) => { document.getElementById(show)?.classList.add('active'); document.getElementById(hide)?.classList.remove('active'); document.getElementById(show.replace('Tab','Form')).style.display = 'block'; document.getElementById(hide.replace('Tab','Form')).style.display = 'none'; };
    document.getElementById('loginTab')?.addEventListener('click', () => _tab('loginTab','registerTab'));
    document.getElementById('registerTab')?.addEventListener('click', () => _tab('registerTab','loginTab'));
    document.getElementById('loginForm')?.addEventListener('submit', (e) => { e.preventDefault(); ui.actions.login(document.getElementById('loginUsername').value, document.getElementById('loginPassword').value); });
    document.getElementById('registerForm')?.addEventListener('submit', (e) => { e.preventDefault(); ui.actions.register(document.getElementById('registerUsername').value, document.getElementById('registerPassword').value, document.getElementById('registerDisplayName').value); });
    document.getElementById('authCancelBtn')?.addEventListener('click', () => ui.actions.hideAuthModal());
    document.getElementById('authCancelBtn2')?.addEventListener('click', () => ui.actions.hideAuthModal());
    document.getElementById('logoutBtn')?.addEventListener('click', () => ui.actions.logout());
    document.getElementById('logoutAllBtn')?.addEventListener('click', async () => { await auth.logoutAll(); ui.actions.hideAuthModal(); ui.render.authStatus(); });
    document.getElementById('userPanelInfo')?.addEventListener('click', () => ui.actions.showAuthModal());
    document.getElementById('userPanelAvatar')?.addEventListener('click', () => ui.actions.showAuthModal());
    ui.authModal?.addEventListener('click', (e) => { if (e.target === ui.authModal) ui.actions.hideAuthModal(); });
    document.getElementById('micToggleBtn')?.addEventListener('click', () => lk.toggleMic());
    document.getElementById('deafenToggleBtn')?.addEventListener('click', () => { state.voiceConnected ? lk.toggleDeafen() : deafen.toggle(); });
    document.getElementById('settingsBtn')?.addEventListener('click', () => ui.actions.toggleSettings());
    document.getElementById('createCategoryBtn')?.addEventListener('click', () => { if (window.channelManager) channelManager.showCreateCategoryModal(); });
    document.addEventListener('click', (e) => { if (ui.settingsPopover.classList.contains('open') && !ui.settingsPopover.contains(e.target) && e.target.id !== 'settingsBtn') ui.settingsPopover.classList.remove('open'); });
    document.getElementById('voiceDisconnectBtn')?.addEventListener('click', () => lk.disconnect());
    document.getElementById('voiceVideoBtn')?.addEventListener('click', () => lk.toggleCamera());
    document.getElementById('voiceMicBtn')?.addEventListener('click', () => lk.toggleMic());
    document.getElementById('voiceDeafenBtn')?.addEventListener('click', () => { state.voiceConnected ? lk.toggleDeafen() : deafen.toggle(); });
    document.getElementById('voiceCamBtn')?.addEventListener('click', () => lk.toggleCamera());
    document.getElementById('voiceLeaveBtn')?.addEventListener('click', () => lk.disconnect());
    document.getElementById('toggleMembersBtn')?.addEventListener('click', () => ui.actions.toggleMembers());
    document.getElementById('toggleQueueBtn')?.addEventListener('click', () => ui.actions.toggleQueue());
    document.getElementById('toggleThreadsBtn')?.addEventListener('click', () => { document.getElementById('threadPanel')?.classList.toggle('open'); });
    document.getElementById('threadPanelClose')?.addEventListener('click', () => { document.getElementById('threadPanel')?.classList.remove('open'); });
    document.getElementById('emojiBtn')?.addEventListener('click', (e) => { e.stopPropagation(); if (window.uiChat) uiChat.showEmojiPicker('_global', e.currentTarget); });
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => ui.actions.openMobileMenu());
    document.getElementById('mobileMembersBtn')?.addEventListener('click', () => ui.actions.toggleMembers());
    ui.drawerOverlay?.addEventListener('click', () => ui.actions.closeMobileMenu());
    const dcToggle = document.getElementById('dataChannelToggle');
    if (dcToggle) { dcToggle.checked = state.useDataChannel; dcToggle.addEventListener('change', (e) => { state.useDataChannel = e.target.checked; }); }
    const relayToggle = document.getElementById('forceRelayToggle');
    if (relayToggle) { relayToggle.checked = localStorage.getItem('zellous_forceRelay') === 'true'; relayToggle.addEventListener('change', (e) => { localStorage.setItem('zellous_forceRelay', e.target.checked ? 'true' : 'false'); }); }
    const rnnoiseToggle = document.getElementById('rnnoiseToggle');
    if (rnnoiseToggle) {
      const stored = localStorage.getItem('zellous_rnnoise');
      rnnoiseToggle.checked = stored === null ? true : stored === 'true';
      rnnoiseToggle.addEventListener('change', async (e) => {
        localStorage.setItem('zellous_rnnoise', e.target.checked ? 'true' : 'false');
        // Hot-swap the track on all active peer connections
        if (!window.nostrVoice || !state.voiceConnected) return;
        const nv = window.nostrVoice;
        const rawStream = state.mediaStream;
        if (!rawStream) return;
        let newStream;
        if (e.target.checked) {
          newStream = await nv._applyRnnoise(rawStream);
        } else {
          // disconnect rnnoise graph, revert to raw
          if (nv._rnnoiseSource) { try { nv._rnnoiseSource.disconnect(); } catch(_) {} nv._rnnoiseSource = null; }
          if (nv._rnnoiseNode)   { try { nv._rnnoiseNode.disconnect();   } catch(_) {} nv._rnnoiseNode   = null; }
          newStream = rawStream;
        }
        nv._localStream = newStream;
        const newTrack = newStream.getAudioTracks()[0];
        if (!newTrack) return;
        nv._peers.forEach((peer) => {
          if (!peer.pc) return;
          peer.pc.getSenders().forEach((sender) => {
            if (sender.track && sender.track.kind === 'audio') {
              sender.replaceTrack(newTrack).catch(() => {});
            }
          });
        });
      });
    }

    // Mic monitor: raw vs processed level bars in settings popover
    let _micMonitorRaf = null;
    let _micMonitorCtx = null;
    const _startMicMonitor = async () => {
      const rawBar = document.getElementById('micRawBar');
      const procBar = document.getElementById('micProcessedBar');
      const monitor = document.getElementById('micMonitor');
      if (!rawBar || !procBar || !monitor) return;

      // Request mic if not yet available
      let rawStream = state.mediaStream;
      if (!rawStream || !rawStream.getAudioTracks().some(t => t.readyState === 'live')) {
        try {
          rawStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
          state.mediaStream = rawStream;
        } catch (e) { monitor.style.display = 'none'; return; }
      }
      monitor.style.display = 'block';

      // Always rebuild analysers fresh (stream may have changed since last open)
      if (_micMonitorRaf) { cancelAnimationFrame(_micMonitorRaf); _micMonitorRaf = null; }
      if (_micMonitorCtx) { _micMonitorCtx.close().catch(() => {}); }
      _micMonitorCtx = new AudioContext();

      const rawAnalyser = _micMonitorCtx.createAnalyser();
      rawAnalyser.fftSize = 512;
      _micMonitorCtx.createMediaStreamSource(rawStream).connect(rawAnalyser);

      // Tap the rnnoise output if active — reuse the existing rnnoise AudioContext
      let procAnalyser = null;
      const nv = window.nostrVoice;
      if (nv?._rnnoiseNode && nv?._rnnoiseCtx?.state === 'running') {
        procAnalyser = nv._rnnoiseCtx.createAnalyser();
        procAnalyser.fftSize = 512;
        nv._rnnoiseNode.connect(procAnalyser);
      }

      const rawData = new Uint8Array(rawAnalyser.frequencyBinCount);
      const procData = procAnalyser ? new Uint8Array(procAnalyser.frequencyBinCount) : null;
      const procLabel = procBar.closest('div').previousElementSibling?.querySelector('span:last-child');

      const rms = (arr) => {
        let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i];
        return Math.min(100, Math.sqrt(s / arr.length) / 128 * 200);
      };

      const tick = () => {
        if (!ui.settingsPopover?.classList.contains('open')) { _micMonitorRaf = null; return; }
        rawAnalyser.getByteFrequencyData(rawData);
        rawBar.style.width = rms(rawData) + '%';
        if (procAnalyser && procData) {
          procAnalyser.getByteFrequencyData(procData);
          procBar.style.width = rms(procData) + '%';
          if (procLabel) procLabel.style.opacity = '1';
        } else {
          procBar.style.width = '0%';
          if (procLabel) procLabel.style.opacity = '0.3';
        }
        _micMonitorRaf = requestAnimationFrame(tick);
      };
      _micMonitorRaf = requestAnimationFrame(tick);
    };
    const _stopMicMonitor = () => {
      if (_micMonitorRaf) { cancelAnimationFrame(_micMonitorRaf); _micMonitorRaf = null; }
      if (_micMonitorCtx) { _micMonitorCtx.close().catch(() => {}); _micMonitorCtx = null; }
    };
    // toggleSettings runs first (toggling .open), so .contains('open') reflects new state here
    document.getElementById('settingsBtn')?.addEventListener('click', () => {
      setTimeout(() => {
        if (ui.settingsPopover?.classList.contains('open')) _startMicMonitor();
        else _stopMicMonitor();
      }, 0);
    });
  }
};

const osjsIntegration = {
  notify: (type, data = {}) => {
    if (window.parent !== window) { try { window.parent.postMessage({ type: `zellous:${type}`, ...data }, '*'); } catch (e) {} }
  },
  handleMessage: (event) => {
    if (!event.data?.type) return;
    if (event.data.type === 'osjs:focus') { if (state.audioContext?.state === 'suspended') state.audioContext.resume(); }
    else if (event.data.type === 'osjs:getState') { osjsIntegration.notify('state', { room: state.roomId, speaking: state.isSpeaking, authenticated: state.isAuthenticated }); }
  },
  wrapPtt: () => {
    const os = ptt.start, op = ptt.stop;
    ptt.start = function() { os.apply(this, arguments); osjsIntegration.notify('speaking', { speaking: true }); };
    ptt.stop = function() { op.apply(this, arguments); osjsIntegration.notify('speaking', { speaking: false }); };
  }
};

window.addEventListener('message', osjsIntegration.handleMessage);
window.audioIO = audioIO;
window.osjsIntegration = osjsIntegration;
window.zellousDebug = { state, config, audio, message, network, ptt, queue, deafen, vad, webcam, lk };

(async () => {
  if (!window.__nostrMode) {
    const lastServer = localStorage.getItem('zellous_lastServer');
    if (lastServer) {
      state.currentServerId = lastServer;
      state.roomId = lastServer;
      if (window.serverManager) { await serverManager.loadServers(); await serverManager.switchTo(lastServer); }
      else { network.connect(); }
    } else {
      network.connect();
      if (window.serverManager) serverManager.loadServers();
    }
    ui.render.channels();
    ui.render.channelView();
    ui.render.authStatus();
  }
  ui_events.setup();
  osjsIntegration.wrapPtt();
  if (window.channelManager) channelManager.initDragAndDrop();
  let _audioInitialized = false;
  const initAudioOnGesture = async () => { if (_audioInitialized) return; _audioInitialized = true; await audioIO.init(); };
  document.addEventListener('click', initAudioOnGesture, { once: true });
  document.addEventListener('touchstart', initAudioOnGesture, { once: true });
  document.addEventListener('keydown', initAudioOnGesture, { once: true });
})();
