var nostrVoiceCamera = {
  _fsm: null,

  _initFSM: function() {
    var actor = XState.createActor(nostrFsm.cameraMachine);
    actor.subscribe(function(snap) {
      var state_val = snap.value;
      document.getElementById('voiceCamBtn')?.classList.toggle('active', state_val === 'active');
    });
    actor.start();
    nostrVoiceCamera._fsm = actor;
  },

  toggle() {
    if (!nostrVoiceCamera._fsm) nostrVoiceCamera._initFSM();
    var snap = nostrVoiceCamera._fsm.getSnapshot();
    if (snap.matches('active')) {
      nostrVoiceCamera.stop();
    } else if (snap.matches('idle')) {
      nostrVoiceCamera.start();
    }
  },

  async start() {
    if (!nostrVoiceCamera._fsm) nostrVoiceCamera._initFSM();
    var snap = nostrVoiceCamera._fsm.getSnapshot();
    if (!snap.can({type:'enable'})) return;
    nostrVoiceCamera._fsm.send({type:'enable'});
    state.cameraEnabled = true;
    if (nostrVoice._cameraStream) {
      var track = nostrVoice._cameraStream.getVideoTracks()[0];
      nostrVoice._peers.forEach(function(peer) {
        var sender = peer.pc.getSenders().find(function(s) { return s.track && s.track.kind === 'video'; });
        if (sender) { sender.replaceTrack(track).catch(function(){}); }
        else { peer.pc.addTrack(track, nostrVoice._cameraStream); }
      });
      var local = nostrVoice._participants.get('local');
      if (local) local.hasVideo = true;
      nostrVoiceCamera._fsm.send({type:'enabled'});
      nostrVoice.updateParticipants();
    } else {
      nostrVoiceCamera._fsm.send({type:'denied'});
      state.cameraEnabled = false;
    }
  },

  stop() {
    if (!nostrVoiceCamera._fsm) nostrVoiceCamera._initFSM();
    if (!nostrVoiceCamera._fsm.getSnapshot().can({type:'disable'})) return;
    nostrVoiceCamera._fsm.send({type:'disable'});
    state.cameraEnabled = false;
    nostrVoice._peers.forEach(function(peer) {
      var sender = peer.pc.getSenders().find(function(s) { return s.track && s.track.kind === 'video'; });
      if (sender) { sender.replaceTrack(null).catch(function(){}); }
    });
    var local = nostrVoice._participants.get('local');
    if (local) local.hasVideo = false;
    nostrVoice.updateParticipants();
  }
};

window.__zellous.voiceCamera = nostrVoiceCamera;
window.nostrVoiceCamera = nostrVoiceCamera;
