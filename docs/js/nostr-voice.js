var nostrVoice = {
  _channelName: '', _roomId: '', _presenceInterval: null,
  _participants: new Map(), _localStream: null, _peers: new Map(), _joinTs: 0,

  _fsm: null,
  _initFSM: function() {
    nostrVoice._fsm = makeFSM({
      idle:         { connect: 'connecting' },
      connecting:   { connected: 'connected', fail: 'idle' },
      connected:    { disconnect: 'disconnecting' },
      disconnecting:{ done: 'idle' }
    }, 'idle', function(prev, ev, next) {
      state.voiceConnectionState = next === 'connected' ? 'connected' : next === 'idle' ? 'disconnected' : next;
      state.voiceConnected = next === 'connected';
    });
  },

  _peerFSM: function(pubkey) {
    return makeFSM({
      new:          { offer: 'offering', recv_offer: 'answering' },
      offering:     { recv_answer: 'connected', fail: 'new', restart: 'offering' },
      answering:    { sent_answer: 'connected', recv_answer: 'connected', fail: 'new' },
      connected:    { disconnect: 'reconnecting', close: 'closed' },
      reconnecting: { offer: 'offering', recv_answer: 'connected', close: 'closed' },
      closed:       {}
    }, 'new', function(prev, ev, next) {
      var peer = nostrVoice._peers.get(pubkey);
      if (peer) peer.state = next;
    });
  },

  async _deriveRoomId(ch) {
    var h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode((state.currentServerId||'default')+':voice:'+ch));
    return 'zellous'+Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16);
  },

  _displayName() { return state.nostrProfile?.name||(state.nostrPubkey?auth.npubShort(state.nostrPubkey):'Guest'); },

  async connect(channelName) {
    if (!nostrVoice._fsm) nostrVoice._initFSM();
    if (!nostrVoice._fsm.can('connect')) { await nostrVoice.disconnect(); }
    nostrVoice._fsm.send('connect');
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
      nostrVoice._fsm.send('connected');
      state.voiceConnectionQuality='good'; state.voiceChannelName=channelName;
      state.voiceReconnectAttempts=0; state.dataChannelAvailable=false;
      nostrVoice._subscribeSignals(); nostrVoice._subscribePresence();
      nostrVoice._publishPresence('join'); nostrVoice._startHeartbeat(); nostrVoice.updateParticipants();
      if(ui.voicePanel) ui.voicePanel.classList.add('visible');
      if(ui.voicePanelChannel) ui.voicePanelChannel.textContent=channelName;
      message.add('Voice connected');
    } catch(e) {
      console.warn('[nostr-voice] connect failed:',e);
      nostrVoice._fsm.send('fail');
      message.add('Voice connection failed: '+e.message);
    }
  },

  async disconnect() {
    if (!nostrVoice._fsm || nostrVoice._fsm.is('idle')) return;
    if (!nostrVoice._fsm.can('disconnect')) return;
    nostrVoice._fsm.send('disconnect');
    nostrVoice._publishPresence('leave'); nostrVoice._stopHeartbeat();
    nostrVoice._peers.forEach((_,pk)=>nostrVoice._closePeer(pk)); nostrVoice._peers.clear();
    if(nostrVoice._localStream&&nostrVoice._localStream!==state.mediaStream){nostrVoice._localStream.getTracks().forEach(t=>t.stop());}
    nostrVoice._localStream=null;
    if(nostrVoice._roomId){nostrNet.unsubscribe('voice-presence-'+nostrVoice._roomId);nostrNet.unsubscribe('voice-signals-'+nostrVoice._roomId);}
    nostrVoice._participants.clear(); nostrVoice._roomId=''; nostrVoice._channelName='';
    state.voiceConnectionQuality='unknown'; state.voiceChannelName='';
    state.voiceParticipants=[]; state.voiceReconnectAttempts=0;
    state.micMuted=false; state.voiceDeafened=false; state.activeSpeakers=new Set();
    if(ui.voicePanel) ui.voicePanel.classList.remove('visible');
    nostrVoice._fsm.send('done');
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

  _iceServers:[
    {urls:'stun:stun.l.google.com:19302'},
    {urls:'stun:stun1.l.google.com:19302'},
    {urls:'stun:stun.cloudflare.com:3478'},
    {urls:'stun:stun.nextcloud.com:443'},
    {url:'turn:openrelay.metered.ca:80',urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},
    {url:'turn:openrelay.metered.ca:443',urls:'turn:openrelay.metered.ca:443',username:'openrelayproject',credential:'openrelayproject'},
    {url:'turn:openrelay.metered.ca:443?transport=tcp',urls:'turn:openrelay.metered.ca:443?transport=tcp',username:'openrelayproject',credential:'openrelayproject'},
    {url:'turns:openrelay.metered.ca:443',urls:'turns:openrelay.metered.ca:443',username:'openrelayproject',credential:'openrelayproject'},
  ],

  _applyOpusCbr(pc) {
    try {
      pc.getSenders().forEach(function(sender) {
        if(!sender.track||sender.track.kind!=='audio') return;
        var params=sender.getParameters();
        if(!params.encodings||!params.encodings.length) return;
        params.encodings[0].networkPriority='high'; params.encodings[0].priority='high';
        sender.setParameters(params).catch(()=>{});
      });
    } catch(e) {}
  },

  _maybeConnect(peerPubkey) {
    if(!peerPubkey||peerPubkey===state.nostrPubkey||nostrVoice._peers.has(peerPubkey)) return;
    var fsm=nostrVoice._peerFSM(peerPubkey);
    var peer={pc:null,audioEl:null,pendingCandidates:[],bufferedCandidates:[],iceTimer:null,disconnectTimer:null,failCount:0,state:'new',fsm:fsm};
    nostrVoice._peers.set(peerPubkey,peer);
    var pc=new RTCPeerConnection({iceServers:nostrVoice._iceServers,bundlePolicy:'max-bundle'}); peer.pc=pc;
    if(nostrVoice._localStream)
      nostrVoice._localStream.getTracks().forEach(t=>pc.addTransceiver(t,{direction:'sendrecv',streams:[nostrVoice._localStream]}));
    else
      pc.addTransceiver('audio',{direction:'recvonly'});
    pc.ontrack=function(ev){
      if(!peer.audioEl){peer.audioEl=new Audio();peer.audioEl.autoplay=true;peer.audioEl.muted=state.voiceDeafened;document.body.appendChild(peer.audioEl);}
      peer.audioEl.srcObject=ev.streams[0];
    };
    pc.onicecandidate=function(ev){
      if(!ev.candidate) return;
      peer.pendingCandidates.push(ev.candidate.toJSON());
      if(peer.iceTimer) clearTimeout(peer.iceTimer);
      peer.iceTimer=setTimeout(function(){
        if(peer.pendingCandidates.length){nostrVoice._publishSignal(peerPubkey,'ice',peer.pendingCandidates.splice(0));peer.iceTimer=null;}
      },500);
    };
    pc.onicegatheringstatechange=function(){
      if(pc.iceGatheringState==='complete'){
        if(peer.iceTimer){clearTimeout(peer.iceTimer);peer.iceTimer=null;}
        if(peer.pendingCandidates.length){nostrVoice._publishSignal(peerPubkey,'ice',peer.pendingCandidates.splice(0));}
      }
    };
    var doIceRestart=function(){
      if(peer.disconnectTimer){clearTimeout(peer.disconnectTimer);peer.disconnectTimer=null;}
      peer.failCount++;
      if(peer.failCount<=1&&state.nostrPubkey>peerPubkey){
        fsm.send('restart'); pc.restartIce();
        pc.createOffer({iceRestart:true}).then(o=>pc.setLocalDescription(o).then(()=>nostrVoice._publishSignal(peerPubkey,'offer',o))).catch(()=>nostrVoice._closePeer(peerPubkey));
      } else { nostrVoice._closePeer(peerPubkey); }
    };
    pc.onconnectionstatechange=function(){
      if(pc.connectionState==='connected'){
        peer.failCount=0; fsm.send('recv_answer');
        if(peer.disconnectTimer){clearTimeout(peer.disconnectTimer);peer.disconnectTimer=null;}
        nostrVoice._applyOpusCbr(pc);
        var p=nostrVoice._participants.get('nostr-'+peerPubkey.slice(0,12));
        if(p){p.connectionQuality='good';nostrVoice.updateParticipants();}
      }
      if(pc.connectionState==='disconnected'){
        fsm.send('disconnect'); peer.disconnectTimer=setTimeout(doIceRestart,8000);
      }
      if(pc.connectionState==='failed') doIceRestart();
      if(pc.connectionState==='closed') nostrVoice._closePeer(peerPubkey);
    };
    var isOfferer=state.nostrPubkey>peerPubkey;
    if(isOfferer){
      fsm.send('offer');
      pc.createOffer().then(o=>pc.setLocalDescription(o).then(()=>nostrVoice._publishSignal(peerPubkey,'offer',o)))
        .catch(e=>console.warn('[nostr-voice] offer:',e));
    }
  },

  _handleSignal(event) {
    var from=event.pubkey; if(from===state.nostrPubkey) return;
    var data; try{data=JSON.parse(event.content);}catch(e){return;} if(!data?.type) return;
    if(!nostrVoice._peers.has(from)) nostrVoice._maybeConnect(from);
    var peer=nostrVoice._peers.get(from); if(!peer) return;
    var pc=peer.pc; var fsm=peer.fsm;
    var addCands=function(cands){cands.forEach(c=>pc.addIceCandidate(new RTCIceCandidate(c)).catch(e=>console.error('[nostr-voice] ice:',e)));};
    var drainBuf=function(){addCands(peer.bufferedCandidates);peer.bufferedCandidates=[];};
    if(data.type==='offer'&&(pc.signalingState==='stable'||pc.signalingState==='have-remote-offer')){
      if(fsm.can('recv_offer')) fsm.send('recv_offer');
      pc.setRemoteDescription(new RTCSessionDescription(data.data)).then(()=>{peer.remoteDescSet=true;drainBuf();return pc.createAnswer();})
        .then(a=>pc.setLocalDescription(a).then(()=>{
          fsm.send('sent_answer');
          nostrVoice._publishSignal(from,'answer',a);
        })).catch(e=>console.warn('[nostr-voice] answer:',e));
    } else if(data.type==='answer'&&pc.signalingState==='have-local-offer'){
      pc.setRemoteDescription(new RTCSessionDescription(data.data)).then(()=>{peer.remoteDescSet=true;drainBuf();}).catch(e=>console.warn('[nostr-voice] set-answer:',e));
    } else if(data.type==='ice'){
      var cands=Array.isArray(data.data)?data.data:[data.data];
      if(peer.remoteDescSet) addCands(cands);
      else peer.bufferedCandidates.push(...cands);
    }
  },

  _subscribeSignals() {
    if(!nostrVoice._roomId||!state.nostrPubkey) return;
    nostrNet.subscribe('voice-signals-'+nostrVoice._roomId,
      [{kinds:[30078],'#p':[state.nostrPubkey],'#r':[nostrVoice._roomId]}],
      nostrVoice._handleSignal,()=>{});
  },

  async _publishSignal(toPubkey,type,data) {
    if(!state.nostrPubkey||!nostrVoice._roomId) return;
    var d='zellous-rtc:'+nostrVoice._roomId+':'+state.nostrPubkey+':'+toPubkey+':'+type+':'+(type==='ice'?Date.now():'sdp');
    nostrNet.publish(await auth.sign({kind:30078,created_at:Math.floor(Date.now()/1000),
      tags:[['d',d],['p',toPubkey],['r',nostrVoice._roomId]],
      content:JSON.stringify({type,data})}));
  },

  updateParticipants() {
    var list=[]; nostrVoice._participants.forEach(p=>list.push(p)); state.voiceParticipants=list;
    if(window.uiVoice){uiVoice.renderGrid();uiVoice.renderPanel();}
    if(window.uiChannels) uiChannels.render();
  },

  async _publishPresence(action) {
    if(!auth.isLoggedIn()||!nostrVoice._roomId) return;
    nostrNet.publish(await auth.sign({kind:30078,created_at:Math.floor(Date.now()/1000),
      tags:[['d','zellous-voice:'+nostrVoice._roomId],['action',action],['channel',nostrVoice._channelName],['server',state.currentServerId||'']],
      content:JSON.stringify({action,name:nostrVoice._displayName(),channel:nostrVoice._channelName,ts:Date.now()})}));
  },

  _startHeartbeat() {
    nostrVoice._stopHeartbeat();
    nostrVoice._presenceInterval=setInterval(()=>{if(nostrVoice._fsm?.is('connected')) nostrVoice._publishPresence('heartbeat');},30000);
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
          if(Date.now()-(data.ts||0)>90000) return;
          var shortId='nostr-'+event.pubkey.slice(0,12);
          if(data.action==='leave'){nostrVoice._participants.delete(shortId);nostrVoice._closePeer(event.pubkey);}
          else if(!nostrVoice._participants.has(shortId)){
            nostrVoice._participants.set(shortId,{identity:data.name||auth.npubShort(event.pubkey),isSpeaking:false,isMuted:false,isLocal:false,hasVideo:false,connectionQuality:'connecting'});
            nostrVoice._maybeConnect(event.pubkey);
          } else if(!nostrVoice._peers.has(event.pubkey)){
            nostrVoice._maybeConnect(event.pubkey);
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
      peers.push({pubkey:pk.slice(0,12),state:peer.state,iceState:peer.pc?.iceConnectionState,conn:peer.pc?.connectionState,candidates:peer.pendingCandidates.length,buffered:peer.bufferedCandidates.length});
    });
    return {fsm:nostrVoice._fsm?.state,peers:peers,participants:state.voiceParticipants};
  }
};

window.lk=nostrVoice;
window.nostrVoice=nostrVoice;
