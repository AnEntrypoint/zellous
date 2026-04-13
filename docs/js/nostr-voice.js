var nostrVoice = {
  _channelName: '', _roomId: '', _presenceInterval: null,
  _participants: new Map(), _localStream: null, _peers: new Map(), _joinTs: 0,
  _fsm: null,

  _initFSM: function() {
    var actor = XState.createActor(nostrFsm.voiceMachine);
    actor.subscribe(function(snap) {
      var next = snap.value;
      state.voiceConnectionState = next === 'connected' ? 'connected' : next === 'idle' ? 'disconnected' : next;
      state.voiceConnected = next === 'connected';
    });
    actor.start();
    nostrVoice._fsm = actor;
  },

  _peerFSM: function(pubkey) {
    var actor = XState.createActor(nostrFsm.peerMachine);
    actor.subscribe(function(snap) {
      var peer = nostrVoice._peers.get(pubkey);
      if (peer) peer.state = snap.value;
    });
    actor.start();
    return actor;
  },

  async _deriveRoomId(ch) {
    var h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode((state.currentServerId||'default')+':voice:'+ch));
    return 'zellous'+Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16);
  },

  _displayName() { return state.nostrProfile?.name||(state.nostrPubkey?auth.npubShort(state.nostrPubkey):'Guest'); },

  async _applyRnnoise(rawStream) {
    try {
      const worketUrl = new URL('../../vendor/rnnoise-worklet.js', document.baseURI).href;
      if (!nostrVoice._rnnoiseCtx) {
        nostrVoice._rnnoiseCtx = new AudioContext({ sampleRate: 48000 });
        await nostrVoice._rnnoiseCtx.audioWorklet.addModule(worketUrl);
      }
      const ctx = nostrVoice._rnnoiseCtx;
      if (ctx.state === 'suspended') await ctx.resume();
      // tear down previous graph nodes if reconnecting
      if (nostrVoice._rnnoiseSource) { try { nostrVoice._rnnoiseSource.disconnect(); } catch(e){} }
      if (nostrVoice._rnnoiseNode) { try { nostrVoice._rnnoiseNode.disconnect(); } catch(e){} }
      const source = ctx.createMediaStreamSource(rawStream);
      const denoiseNode = new AudioWorkletNode(ctx, 'NoiseSuppressorWorklet');
      const dest = ctx.createMediaStreamDestination();
      source.connect(denoiseNode);
      denoiseNode.connect(dest);
      nostrVoice._rnnoiseSource = source;
      nostrVoice._rnnoiseNode = denoiseNode;
      nostrVoice._rnnoiseDest = dest;
      return dest.stream;
    } catch(e) {
      console.warn('[nostr-voice] rnnoise unavailable, using raw stream:', e.message);
      return rawStream;
    }
  },

  _rnnoiseEnabled() {
    const stored = localStorage.getItem('zellous_rnnoise');
    return stored === null ? true : stored === 'true';
  },

  async connect(channelName) {
    if (!nostrVoice._fsm) nostrVoice._initFSM();
    if (!nostrVoice._fsm.getSnapshot().can({type:'connect'})) { await nostrVoice.disconnect(); }
    nostrVoice._fsm.send({type:'connect'});
    nostrVoice._channelName = channelName;
    nostrVoice._joinTs = Math.floor(Date.now()/1000);
    try {
      nostrVoice._roomId = await nostrVoice._deriveRoomId(channelName);
      let rawStream;
      if (state.mediaStream && state.mediaStream.getAudioTracks().some(t=>t.readyState==='live')) {
        rawStream = state.mediaStream;
      } else {
        rawStream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
        state.mediaStream = rawStream;
      }
      if (nostrVoice._rnnoiseEnabled()) {
        nostrVoice._localStream = await nostrVoice._applyRnnoise(rawStream);
      } else {
        nostrVoice._localStream = rawStream;
      }
      if (state.cameraEnabled && !nostrVoice._cameraStream) {
        try {
          const [w, h] = state.webcamResolution.split('x').map(Number);
          nostrVoice._cameraStream = await navigator.mediaDevices.getUserMedia({video:{width:w,height:h,frameRate:state.webcamFps,facingMode:'user'}});
        } catch(e) {
          console.warn('[nostr-voice] camera access denied:', e.message);
          state.cameraEnabled = false;
        }
      }
      nostrVoice._participants.clear();
      nostrVoice._participants.set('local',{identity:nostrVoice._displayName(),isSpeaking:false,isMuted:false,isLocal:true,hasVideo:!!nostrVoice._cameraStream,connectionQuality:'good'});
      nostrVoice._fsm.send({type:'connected'});
      state.voiceConnectionQuality='good'; state.voiceChannelName=channelName;
      state.voiceReconnectAttempts=0; state.dataChannelAvailable=false;
      nostrVoiceRtc.subscribe(nostrVoice._roomId,state.nostrPubkey);
      if(window.nostrBans) nostrBans.subscribe(state.currentServerId||'');
      nostrVoice._subscribePresence();
      nostrVoice._publishPresence('join'); nostrVoice._startHeartbeat(); nostrVoice.updateParticipants();
      if(window.serverSettings) serverSettings.applyToEncoder();
      if(window.nostrVoiceSfu) nostrVoiceSfu.start();
      if(ui.voicePanel) ui.voicePanel.classList.add('visible');
      if(ui.voicePanelChannel) ui.voicePanelChannel.textContent=channelName;
      message.add('Voice connected');
    } catch(e) {
      console.warn('[nostr-voice] connect failed:',e);
      nostrVoice._fsm.send({type:'fail'});
      message.add('Voice connection failed: '+e.message);
    }
  },

  async disconnect() {
    if (!nostrVoice._fsm || nostrVoice._fsm.getSnapshot().matches('idle')) return;
    if (!nostrVoice._fsm.getSnapshot().can({type:'disconnect'})) return;
    nostrVoice._fsm.send({type:'disconnect'});
    nostrVoice._publishPresence('leave'); nostrVoice._stopHeartbeat();
    if(window.nostrVoiceSfu) nostrVoiceSfu.stop();
    nostrVoice._peers.forEach((_,pk)=>nostrVoice._closePeer(pk)); nostrVoice._peers.clear();
    if(nostrVoice._cameraStream){nostrVoice._cameraStream.getTracks().forEach(function(t){t.stop();});nostrVoice._cameraStream=null;}
    state.cameraEnabled=false;
    if(nostrVoice._localStream&&nostrVoice._localStream!==state.mediaStream){nostrVoice._localStream.getTracks().forEach(t=>t.stop());}
    nostrVoice._localStream=null;
    // tear down rnnoise graph (keep ctx alive for reuse, just disconnect nodes)
    if(nostrVoice._rnnoiseSource){try{nostrVoice._rnnoiseSource.disconnect();}catch(e){} nostrVoice._rnnoiseSource=null;}
    if(nostrVoice._rnnoiseNode){try{nostrVoice._rnnoiseNode.disconnect();}catch(e){} nostrVoice._rnnoiseNode=null;}
    if(nostrVoice._roomId){nostrNet.unsubscribe('voice-presence-'+nostrVoice._roomId);nostrNet.unsubscribe('voice-signals-'+nostrVoice._roomId);}
    nostrVoice._participants.clear(); nostrVoice._roomId=''; nostrVoice._channelName='';
    state.voiceConnectionQuality='unknown'; state.voiceChannelName='';
    state.voiceParticipants=[]; state.voiceReconnectAttempts=0;
    state.micMuted=false; state.voiceDeafened=false; state.activeSpeakers=new Set();
    if(ui.voicePanel) ui.voicePanel.classList.remove('visible');
    nostrVoice._fsm.send({type:'done'});
    nostrVoice.updateParticipants();
  },

  _closePeer(pubkey) {
    var peer=nostrVoice._peers.get(pubkey); if(!peer) return;
    if(peer.iceTimer) clearTimeout(peer.iceTimer);
    if(peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
    if(peer._stallInterval) clearInterval(peer._stallInterval);
    try{peer.pc?.close();}catch(e){}
    if(peer.audioEl){peer.audioEl.srcObject=null;peer.audioEl.remove();}
    nostrVoice._peers.delete(pubkey);
  },

  toggleMic() {
    state.micMuted=!state.micMuted;
    // mute the raw mic stream (affects both direct and rnnoise-processed path)
    const rawStream = state.mediaStream;
    if(rawStream) rawStream.getAudioTracks().forEach(t=>{t.enabled=!state.micMuted;});
    // also mute processed stream output tracks if rnnoise is active
    if(nostrVoice._localStream && nostrVoice._localStream !== rawStream) nostrVoice._localStream.getAudioTracks().forEach(t=>{t.enabled=!state.micMuted;});
    var local=nostrVoice._participants.get('local'); if(local) local.isMuted=state.micMuted;
    nostrVoice.updateParticipants();
    document.getElementById('micToggleBtn')?.classList.toggle('muted',state.micMuted);
    document.getElementById('voiceMicBtn')?.classList.toggle('active',!state.micMuted);
  },

  toggleDeafen() {
    state.voiceDeafened=!state.voiceDeafened;
    nostrVoice._peers.forEach(peer=>{if(peer.audioEl) peer.audioEl.muted=state.voiceDeafened;});
    document.getElementById('deafenToggleBtn')?.classList.toggle('muted',state.voiceDeafened);
    document.getElementById('voiceDeafenBtn')?.classList.toggle('active',state.voiceDeafened);
    nostrVoice.updateParticipants();
  },

  toggleCamera() { return nostrVoiceCamera.toggle(); },

  _publishSignal(toPubkey,type,data) { return nostrVoiceRtc.publish(toPubkey,type,data,nostrVoice._roomId); },
  _maybeConnect(pk) { nostrVoiceRtc.maybeConnect(pk); },
  _subscribeSignals() { nostrVoiceRtc.subscribe(nostrVoice._roomId,state.nostrPubkey); },

  updateParticipants() {
    var list=[]; nostrVoice._participants.forEach(p=>list.push(p)); state.voiceParticipants=list;
    if(window.uiVoice){uiVoice.renderGrid();uiVoice.renderPanel();}
    if(window.uiChannels) uiChannels.render();
  },

  _rttScores() {
    var scores = {};
    if(window.nostrVoiceSfu) {
      var myScores = nostrVoiceSfu._rttMatrix.get(state.nostrPubkey);
      if(myScores) Object.assign(scores, myScores);
    }
    return scores;
  },

  async _publishPresence(action) {
    if(!auth.isLoggedIn()||!nostrVoice._roomId) return;
    var rttScores = action === 'heartbeat' ? nostrVoice._rttScores() : {};
    nostrNet.publish(await auth.sign({kind:30078,created_at:Math.floor(Date.now()/1000),
      tags:[['d','zellous-voice:'+nostrVoice._roomId],['action',action],['channel',nostrVoice._channelName],['server',state.currentServerId||'']],
      content:JSON.stringify({action,name:nostrVoice._displayName(),channel:nostrVoice._channelName,ts:Date.now(),rttScores})}));
  },

  _startHeartbeat() {
    nostrVoice._stopHeartbeat();
    nostrVoice._presenceInterval=setInterval(()=>{if(nostrVoice._fsm?.getSnapshot().matches('connected')) nostrVoice._publishPresence('heartbeat');},30000);
  },

  _stopHeartbeat() { if(nostrVoice._presenceInterval){clearInterval(nostrVoice._presenceInterval);nostrVoice._presenceInterval=null;} },

  _subscribePresence() {
    if(!nostrVoice._roomId) return;
    nostrNet.subscribe('voice-presence-'+nostrVoice._roomId,
      [{kinds:[30078],'#d':['zellous-voice:'+nostrVoice._roomId]}],
      function(event) {
        if(event.pubkey===state.nostrPubkey) return;
        try {
          var data=JSON.parse(event.content);
          if(Date.now()-(data.ts||0)>300000) return;
          var shortId='nostr-'+event.pubkey.slice(0,12);
          if(data.rttScores && window.nostrVoiceSfu) nostrVoiceSfu.onPresenceRtt(event.pubkey, data.rttScores);
          if(data.action==='leave'){nostrVoice._participants.delete(shortId);nostrVoice._closePeer(event.pubkey);}
          else if(!nostrVoice._participants.has(shortId)){
            nostrVoice._participants.set(shortId,{identity:data.name||auth.npubShort(event.pubkey),isSpeaking:false,isMuted:false,isLocal:false,hasVideo:false,connectionQuality:'connecting'});
            nostrVoiceRtc.maybeConnect(event.pubkey);
          } else if(!nostrVoice._peers.has(event.pubkey)){
            nostrVoiceRtc.maybeConnect(event.pubkey);
          } else {
            var existingPeer=nostrVoice._peers.get(event.pubkey);
            if(existingPeer&&existingPeer.pc&&existingPeer.pc.connectionState==='new'&&state.nostrPubkey>event.pubkey){
              existingPeer.pc.createOffer().then(o=>existingPeer.pc.setLocalDescription(o).then(()=>nostrVoice._publishSignal(event.pubkey,'offer',o))).catch(()=>{});
            }
          }
          nostrVoice.updateParticipants();
        } catch(e){}
      },()=>{});
  },

  isDataChannelReady:()=>false,
  updateVoiceGrid(){nostrVoice.updateParticipants();},

  get __debug() {
    var peers=[];
    nostrVoice._peers.forEach(function(peer,pk){
      var audioState=null;
      if(peer.audioEl){audioState=peer.audioEl.ended?'ended':peer.audioEl.paused?'paused':'playing';}
      var trackState=null;
      if(peer.audioEl&&peer.audioEl.srcObject){var tracks=peer.audioEl.srcObject.getAudioTracks();trackState=tracks.length?tracks[0].readyState:'none';}
      peers.push({pubkey:pk.slice(0,12),fsmState:peer.fsm?.getSnapshot().value,iceState:peer.pc?.iceConnectionState,connState:peer.pc?.connectionState,audioState:audioState,trackState:trackState,retryAttempt:peer.retryAttempt||0,retryAt:peer.retryAt||null,candidates:peer.pendingCandidates?.length??0,buffered:peer.bufferedCandidates?.length??0});
    });
    var sfu=window.nostrVoiceSfu?nostrVoiceSfu.__debug:null;
    var camera=window.nostrVoiceCamera?{fsm:nostrVoiceCamera._fsm?.getSnapshot().value,stream:!!nostrVoice._cameraStream,enabled:state.cameraEnabled}:null;
    return {fsm:nostrVoice._fsm?.getSnapshot().value,camera:camera,peers:peers,participants:state.voiceParticipants,sfu:sfu,retrySchedule:window.__voiceRetrySchedule||{}};
  }
};

window.__zellous.voice=nostrVoice;
window.lk=nostrVoice;
window.nostrVoice=nostrVoice;
if(!window.__debug) window.__debug={};
Object.defineProperty(window.__debug,'voice',{get:function(){return nostrVoice.__debug;},configurable:true});
