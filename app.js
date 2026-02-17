const audioIO = {
  init: async () => {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: config.sampleRate });
    await audioIO.enumerateDevices();
    await audioIO.selectInput(state.inputDeviceId);
  },
  enumerateDevices: async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    // Populate both threaded view and settings popover selects
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
      audioIO.setupRecording();
      await audioIO.enumerateDevices();
    } catch (e) { console.warn('Microphone denied'); }
  },
  selectOutput: async (deviceId) => {
    state.outputDeviceId = deviceId;
    if (state.audioContext.destination.setSinkId) await state.audioContext.destination.setSinkId(deviceId);
  },
  setupRecording: () => {
    audio.initEncoder();
    state.scriptProcessor = state.audioContext.createScriptProcessor(config.chunkSize, 1, 1);
    const source = state.audioContext.createMediaStreamSource(state.mediaStream);
    state.scriptProcessor.onaudioprocess = (e) => {
      if (state.isSpeaking && state.audioEncoder) {
        const samples = e.inputBuffer.getChannelData(0);
        const d = new AudioData({ format: 'f32-planar', sampleRate: config.sampleRate, numberOfFrames: samples.length, numberOfChannels: 1, timestamp: performance.now() * 1000, data: samples });
        state.audioEncoder.encode(d);
        d.close();
      }
    };
    source.connect(state.scriptProcessor);
    state.scriptProcessor.connect(state.audioContext.destination);
  }
};

const ui_events = {
  setup: () => {
    // Audio context resume on user interaction
    const resume = () => { if (state.audioContext?.state === 'suspended') state.audioContext.resume(); };
    document.addEventListener('click', resume, { once: false });
    document.addEventListener('touchstart', resume, { once: false });

    // PTT button events
    if (ui.ptt) {
      ui.ptt.addEventListener('mousedown', () => { if (!state.vadEnabled) ptt.start(); });
      ui.ptt.addEventListener('mouseup', () => { if (!state.vadEnabled) ptt.stop(); });
      ui.ptt.addEventListener('touchstart', (e) => { e.preventDefault(); if (!state.vadEnabled) ptt.start(); });
      ui.ptt.addEventListener('touchend', () => { if (!state.vadEnabled) ptt.stop(); });
      ui.ptt.addEventListener('touchcancel', () => { if (!state.vadEnabled) ptt.stop(); });
    }

    // Volume slider (threaded view)
    ui.volumeSlider?.addEventListener('input', (e) => {
      state.masterVolume = e.target.value / 100;
      state.audioSources.forEach(s => s.gainNode.gain.value = state.masterVolume);
      ui.volumeValue.textContent = e.target.value + '%';
      // Sync settings popover
      const sv = document.getElementById('settingsVolume');
      if (sv) sv.value = e.target.value;
      const svv = document.getElementById('settingsVolValue');
      if (svv) svv.textContent = e.target.value + '%';
    });

    // Settings volume slider
    document.getElementById('settingsVolume')?.addEventListener('input', (e) => {
      state.masterVolume = e.target.value / 100;
      state.audioSources.forEach(s => s.gainNode.gain.value = state.masterVolume);
      document.getElementById('settingsVolValue').textContent = e.target.value + '%';
      if (ui.volumeSlider) ui.volumeSlider.value = e.target.value;
      if (ui.volumeValue) ui.volumeValue.textContent = e.target.value + '%';
    });

    // Deafen and VAD buttons (threaded view)
    ui.deafenBtn?.addEventListener('click', deafen.toggle);
    ui.vadBtn?.addEventListener('click', vad.toggle);
    ui.vadThreshold?.addEventListener('input', (e) => { vad.setThreshold(e.target.value); ui.vadValue.textContent = e.target.value + '%'; });
    ui.webcamBtn?.addEventListener('click', () => {
      webcam.toggle();
      setTimeout(() => {
        ui.webcamControls.classList.toggle('hidden', !state.webcamEnabled);
      }, 100);
    });
    ui.webcamResolution?.addEventListener('change', (e) => { state.webcamResolution = e.target.value; if (state.webcamEnabled) { webcam.disable(); webcam.enable(); } });
    ui.webcamFps?.addEventListener('change', (e) => { state.webcamFps = parseInt(e.target.value); if (state.webcamEnabled) { webcam.disable(); webcam.enable(); } });
    ui.inputDevice?.addEventListener('change', (e) => audioIO.selectInput(e.target.value));
    ui.outputDevice?.addEventListener('change', (e) => audioIO.selectOutput(e.target.value));
    document.getElementById('settingsInputDevice')?.addEventListener('change', (e) => audioIO.selectInput(e.target.value));
    document.getElementById('settingsOutputDevice')?.addEventListener('change', (e) => audioIO.selectOutput(e.target.value));

    // Chat input
    ui.chatInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        ui.actions.sendChat();
      }
    });
    document.getElementById('sendBtn')?.addEventListener('click', () => ui.actions.sendChat());
    document.getElementById('attachBtn')?.addEventListener('click', () => ui.actions.uploadFile());
    ui.fileInput?.addEventListener('change', (e) => ui.actions.handleFileSelect(e));

    // Paste image handling
    document.addEventListener('paste', (e) => {
      if (document.activeElement === ui.chatInput) {
        fileTransfer.uploadFromClipboard(e);
      }
    });

    // Drag and drop
    document.body.addEventListener('dragover', (e) => e.preventDefault());
    document.body.addEventListener('drop', (e) => fileTransfer.handleDrop(e));

    // Auth modal events
    document.getElementById('loginTab')?.addEventListener('click', () => {
      document.getElementById('loginTab').classList.add('active');
      document.getElementById('registerTab').classList.remove('active');
      document.getElementById('loginForm').style.display = 'block';
      document.getElementById('registerForm').style.display = 'none';
    });
    document.getElementById('registerTab')?.addEventListener('click', () => {
      document.getElementById('registerTab').classList.add('active');
      document.getElementById('loginTab').classList.remove('active');
      document.getElementById('registerForm').style.display = 'block';
      document.getElementById('loginForm').style.display = 'none';
    });
    document.getElementById('loginForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      ui.actions.login(document.getElementById('loginUsername').value, document.getElementById('loginPassword').value);
    });
    document.getElementById('registerForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      ui.actions.register(document.getElementById('registerUsername').value, document.getElementById('registerPassword').value, document.getElementById('registerDisplayName').value);
    });
    document.getElementById('authCancelBtn')?.addEventListener('click', () => ui.actions.hideAuthModal());
    document.getElementById('authCancelBtn2')?.addEventListener('click', () => ui.actions.hideAuthModal());
    document.getElementById('logoutBtn')?.addEventListener('click', () => ui.actions.logout());
    document.getElementById('logoutAllBtn')?.addEventListener('click', async () => {
      await auth.logoutAll();
      ui.actions.hideAuthModal();
      ui.render.authStatus();
    });

    // User panel click to open auth modal
    document.getElementById('userPanelInfo')?.addEventListener('click', () => ui.actions.showAuthModal());
    document.getElementById('userPanelAvatar')?.addEventListener('click', () => ui.actions.showAuthModal());

    // Close modal on overlay click
    ui.authModal?.addEventListener('click', (e) => {
      if (e.target === ui.authModal) ui.actions.hideAuthModal();
    });

    // User panel controls
    document.getElementById('micToggleBtn')?.addEventListener('click', () => lk.toggleMic());
    document.getElementById('deafenToggleBtn')?.addEventListener('click', () => {
      state.voiceConnected ? lk.toggleDeafen() : deafen.toggle();
    });
    document.getElementById('settingsBtn')?.addEventListener('click', () => ui.actions.toggleSettings());

    // Close settings on outside click
    document.addEventListener('click', (e) => {
      if (ui.settingsPopover.classList.contains('open') && !ui.settingsPopover.contains(e.target) && e.target.id !== 'settingsBtn') {
        ui.settingsPopover.classList.remove('open');
      }
    });

    // Voice channel buttons
    document.getElementById('voiceDisconnectBtn')?.addEventListener('click', () => lk.disconnect());
    document.getElementById('voiceVideoBtn')?.addEventListener('click', () => lk.toggleCamera());
    document.getElementById('voiceMicBtn')?.addEventListener('click', () => lk.toggleMic());
    document.getElementById('voiceDeafenBtn')?.addEventListener('click', () => {
      state.voiceConnected ? lk.toggleDeafen() : deafen.toggle();
    });
    document.getElementById('voiceCamBtn')?.addEventListener('click', () => lk.toggleCamera());
    document.getElementById('voiceLeaveBtn')?.addEventListener('click', () => lk.disconnect());

    // Toolbar buttons
    document.getElementById('toggleMembersBtn')?.addEventListener('click', () => ui.actions.toggleMembers());
    document.getElementById('toggleQueueBtn')?.addEventListener('click', () => ui.actions.toggleQueue());

    // Mobile navigation
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => ui.actions.openMobileMenu());
    document.getElementById('mobileMembersBtn')?.addEventListener('click', () => ui.actions.toggleMembers());
    ui.drawerOverlay?.addEventListener('click', () => ui.actions.closeMobileMenu());

    // Voice settings toggles
    const dcToggle = document.getElementById('dataChannelToggle');
    if (dcToggle) {
      dcToggle.checked = state.useDataChannel;
      dcToggle.addEventListener('change', (e) => { state.useDataChannel = e.target.checked; });
    }
    const relayToggle = document.getElementById('forceRelayToggle');
    if (relayToggle) {
      relayToggle.checked = localStorage.getItem('zellous_forceRelay') === 'true';
      relayToggle.addEventListener('change', (e) => {
        localStorage.setItem('zellous_forceRelay', e.target.checked ? 'true' : 'false');
      });
    }
  }
};

const osjsIntegration = {
  notify: (type, data = {}) => {
    if (window.parent !== window) {
      try { window.parent.postMessage({ type: `zellous:${type}`, ...data }, '*'); } catch (e) {}
    }
  },
  handleMessage: (event) => {
    if (!event.data?.type) return;
    switch (event.data.type) {
      case 'osjs:focus':
        if (state.audioContext?.state === 'suspended') state.audioContext.resume();
        break;
      case 'osjs:getState':
        osjsIntegration.notify('state', { room: state.roomId, speaking: state.isSpeaking, authenticated: state.isAuthenticated });
        break;
    }
  },
  wrapPtt: () => {
    const originalStart = ptt.start;
    const originalStop = ptt.stop;
    ptt.start = function() { originalStart.apply(this, arguments); osjsIntegration.notify('speaking', { speaking: true }); };
    ptt.stop = function() { originalStop.apply(this, arguments); osjsIntegration.notify('speaking', { speaking: false }); };
  }
};

window.addEventListener('message', osjsIntegration.handleMessage);
window.audioIO = audioIO;
window.osjsIntegration = osjsIntegration;
window.zellousDebug = { state, config, audio, message, network, ptt, queue, deafen, vad, webcam, lk };

(async () => {
  const lastServer = localStorage.getItem('zellous_lastServer');
  if (lastServer) {
    state.currentServerId = lastServer;
    state.roomId = lastServer;
    if (window.serverManager) {
      await serverManager.loadServers();
      await serverManager.switchTo(lastServer);
    } else {
      network.connect();
    }
  } else {
    network.connect();
  }
  ui.render.channels();
  ui.render.channelView();
  ui.render.authStatus();
  await audioIO.init();
  ui_events.setup();
  osjsIntegration.wrapPtt();
  if (window.serverManager && !lastServer) serverManager.loadServers();
})();
