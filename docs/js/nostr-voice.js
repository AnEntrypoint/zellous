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

  async connect(channelName) {
    if (!nostrVoice._fsm) nostrVoice._initFSM();
    if (!nostrVoice._fsm.getSnapshot().can({type:'connect'})) { await nostrVoice.disconnect(); }
    nostrVoice._fsm.send({type:'connect'});
    nostrVoice._channelName = channelName;
    nostrVoice._joinTs = Math.floor(Date.now()/1000);
    try {
      nostrVoice._roomId = await nostrVoice._deriveRoomId(channelName);
      if (state.mediaStream && state.mediaStream.getAudioTracks().some(t=>t.readyState==='live')) {
        nostrVoice._localStream = state.mediaStream;
      } else {
        nostrVoice._localStream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
        state.mediaStream = nostrVoice._localStream;
      }
      nostrVoice._participants.clear();
      nostrVoice._participants.set('local',{identity:nostrVoice._displayName(),isSpeaking:false,isMuted:false,isLocal:true,hasVideo:false,connectionQuality:'good'});
      nostrVoice._fsm.send({type:'connected'});
      state.voiceConnectionQuality='good'; state.voiceChannelName=channelName;
      state.voiceReconnectAttempts=0; state.dataChannelAvailable=false;
      nostrVoiceRtc.subscribe(nostrVoice._roomId,state.nostrPubkey);
      nostrVoice._subscribePresence();
      nostrVoice._publishPresence('join'); nostrVoice._startHeartbeat(); nostrVoice.updateParticipants();
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
    if(nostrVoice._localStream&&nostrVoice._localStream!==state.mediaStream){nostrVoice._localStream.getTracks().forEach(t=>t.stop());}
    nostrVoice._localStream=null;
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
    try{peer.pc?.close();}catch(e){}
    if(peer.audioEl){peer.audioEl.srcObject=null;peer.audioEl.remove();}
    nostrVoice._peers.delete(pubkey);
  },

  toggleMic() {
    state.micMuted=!state.micMuted;
    if(nostrVoice._localStream) nostrVoice._localStream.getAudioTracks().forEach(t=>{t.enabled=!state.micMuted;});
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

  toggleCamera(){message.add('Camera not available in voice-only mode');},

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
    return {fsm:nostrVoice._fsm?.getSnapshot().value,peers:peers,participants:state.voiceParticipants,sfu:sfu,retrySchedule:window.__voiceRetrySchedule||{}};
  }
};

window.lk=nostrVoice;
window.nostrVoice=nostrVoice;
