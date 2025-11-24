const audioIO = {
  init: async () => {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: config.sampleRate });
    await audioIO.enumerateDevices();
    await audioIO.selectInput(state.inputDeviceId);
  },
  enumerateDevices: async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    ui.inputDevice.innerHTML = '';
    ui.outputDevice.innerHTML = '';
    devices.forEach(d => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `${d.kind} (${d.deviceId.slice(0, 8)})`;
      if (d.kind === 'audioinput') ui.inputDevice.appendChild(o);
      if (d.kind === 'audiooutput') ui.outputDevice.appendChild(o);
    });
    if (state.inputDeviceId) ui.inputDevice.value = state.inputDeviceId;
    if (state.outputDeviceId) ui.outputDevice.value = state.outputDeviceId;
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
    } catch (e) { ui.setStatus('Microphone denied', true); }
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
    const resume = () => { if (state.audioContext?.state === 'suspended') state.audioContext.resume(); };
    document.addEventListener('click', resume, { once: false });
    document.addEventListener('touchstart', resume, { once: false });
    document.addEventListener('keydown', resume, { once: false });
    ui.ptt.addEventListener('mousedown', () => { if (!state.vadEnabled) ptt.start(); });
    ui.ptt.addEventListener('mouseup', () => { if (!state.vadEnabled) ptt.stop(); });
    ui.ptt.addEventListener('touchstart', () => { if (!state.vadEnabled) ptt.start(); });
    ui.ptt.addEventListener('touchend', () => { if (!state.vadEnabled) ptt.stop(); });
    ui.ptt.addEventListener('touchcancel', () => { if (!state.vadEnabled) ptt.stop(); });
    ui.volumeSlider.addEventListener('input', (e) => { state.masterVolume = e.target.value / 100; state.audioSources.forEach(s => s.gainNode.gain.value = state.masterVolume); ui.volumeValue.textContent = e.target.value + '%'; });
    ui.deafenBtn.addEventListener('click', deafen.toggle);
    ui.vadBtn.addEventListener('click', vad.toggle);
    ui.vadThreshold.addEventListener('input', (e) => { vad.setThreshold(e.target.value); ui.vadValue.textContent = e.target.value + '%'; });
    ui.webcamBtn.addEventListener('click', webcam.toggle);
    ui.webcamResolution.addEventListener('change', (e) => { state.webcamResolution = e.target.value; if (state.webcamEnabled) { webcam.disable(); webcam.enable(); } });
    ui.webcamFps.addEventListener('change', (e) => { state.webcamFps = parseInt(e.target.value); if (state.webcamEnabled) { webcam.disable(); webcam.enable(); } });
    ui.inputDevice.addEventListener('change', (e) => audioIO.selectInput(e.target.value));
    ui.outputDevice.addEventListener('change', (e) => audioIO.selectOutput(e.target.value));
  }
};
window.audioIO = audioIO;
window.zellousDebug = { state, config, audio, message, network, ptt, queue, deafen, vad, webcam };
(async () => { ui.render.roomName(); await audioIO.init(); network.connect(); ui_events.setup(); })();
