var nostrVoiceCamera = {
  toggle() {
    if (state.cameraEnabled) nostrVoiceCamera.stop();
    else nostrVoiceCamera.start();
  },

  async start() {
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 24, facingMode: 'user' } });
      nostrVoice._cameraStream = stream;
      var track = stream.getVideoTracks()[0];
      nostrVoice._peers.forEach(function(peer) {
        var sender = peer.pc.getSenders().find(function(s) { return s.track && s.track.kind === 'video'; });
        if (sender) { sender.replaceTrack(track).catch(function(){}); }
        else { peer.pc.addTrack(track, stream); }
      });
      state.cameraEnabled = true;
      var local = nostrVoice._participants.get('local');
      if (local) local.hasVideo = true;
      document.getElementById('voiceCamBtn')?.classList.add('active');
      nostrVoice.updateParticipants();
    } catch(e) {
      message.add('Camera access denied: ' + e.message);
    }
  },

  stop() {
    if (nostrVoice._cameraStream) {
      nostrVoice._cameraStream.getTracks().forEach(function(t) { t.stop(); });
      nostrVoice._cameraStream = null;
    }
    nostrVoice._peers.forEach(function(peer) {
      var sender = peer.pc.getSenders().find(function(s) { return s.track && s.track.kind === 'video'; });
      if (sender) { sender.replaceTrack(null).catch(function(){}); }
    });
    state.cameraEnabled = false;
    var local = nostrVoice._participants.get('local');
    if (local) local.hasVideo = false;
    document.getElementById('voiceCamBtn')?.classList.remove('active');
    nostrVoice.updateParticipants();
  }
};

window.nostrVoiceCamera = nostrVoiceCamera;
