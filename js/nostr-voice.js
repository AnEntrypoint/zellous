var nostrVoice = {
  _channelName: '', _roomId: '', _presenceInterval: null,
  _participants: new Map(), _localStream: null, _peers: new Map(), _joinTs: 0,

  async _deriveRoomId(ch) {
    var h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode((state.currentServerId||'default')+':voice:'+ch));
    return 'zellous'+Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16);
  },

  _displayName() { return state.nostrProfile?.name||(state.nostrPubkey?auth.npubShort(state.nostrPubkey):'Guest'); },

  async connect(channelName) {
    if (nostrVoice._localStream) await nostrVoice.disconnect();
    nostrVoice._channelName = channelName;
    nostrVoice._joinTs = Math.floor(Date.now()/1000);
    state.voiceConnectionState = 'connecting';
    try {
      nostrVoice._roomId = await nostrVoice._deriveRoomId(channelName);
      nostrVoice._localStream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      state.mediaStream = nostrVoice._localStream;
      nostrVoice._participants.clear();
      nostrVoice._participants.set('local',{identity:nostrVoice._displayName(),isSpeaking:false,isMuted:false,isLocal:true,hasVideo:false,connectionQuality:'good'});
      state.voiceConnected=true; state.voiceConnectionState='connected'; state.voiceConnectionQuality='good';
      state.voiceChannelName=channelName; state.voiceReconnectAttempts=0; state.dataChannelAvailable=false;
      nostrVoice._subscribeSignals(); nostrVoice._subscribePresence();
      nostrVoice._publishPresence('join'); nostrVoice._startHeartbeat(); nostrVoice.updateParticipants();
      if(ui.voicePanel) ui.voicePanel.classList.add('visible');
      if(ui.voicePanelChannel) ui.voicePanelChannel.textContent=channelName;
      message.add('Voice connected');
    } catch(e) {
      console.warn('[nostr-voice] connect failed:',e);
      state.voiceConnected=false; state.voiceConnectionState='disconnected';
      message.add('Voice connection failed: '+e.message);
    }
  },

  async disconnect() {
    nostrVoice._publishPresence('leave'); nostrVoice._stopHeartbeat();
    nostrVoice._peers.forEach((_,pk)=>nostrVoice._closePeer(pk)); nostrVoice._peers.clear();
    if(nostrVoice._localStream){nostrVoice._localStream.getTracks().forEach(t=>t.stop());nostrVoice._localStream=null;}
    state.mediaStream=null;
    if(nostrVoice._roomId){nostrNet.unsubscribe('voice-presence-'+nostrVoice._roomId);nostrNet.unsubscribe('voice-signals-'+nostrVoice._roomId);}
    nostrVoice._participants.clear(); nostrVoice._roomId=''; nostrVoice._channelName='';
    state.voiceConnected=false; state.voiceConnectionState='disconnected'; state.voiceConnectionQuality='unknown';
    state.voiceChannelName=''; state.voiceParticipants=[]; state.voiceReconnectAttempts=0;
    state.micMuted=false; state.voiceDeafened=false; state.activeSpeakers=new Set();
    if(ui.voicePanel) ui.voicePanel.classList.remove('visible');
    nostrVoice.updateParticipants();
  },

  _closePeer(pubkey) {
    var peer=nostrVoice._peers.get(pubkey); if(!peer) return;
    if(peer.iceTimer) clearTimeout(peer.iceTimer);
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

  _iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}],

  _maybeConnect(peerPubkey) {
    if(!peerPubkey||peerPubkey===state.nostrPubkey||nostrVoice._peers.has(peerPubkey)) return;
    var peer={pc:null,audioEl:null,bufferedCandidates:[],remoteDescSet:false,iceTimer:null};
    nostrVoice._peers.set(peerPubkey,peer);
    var pc=new RTCPeerConnection({iceServers:nostrVoice._iceServers}); peer.pc=pc;
    if(nostrVoice._localStream) nostrVoice._localStream.getTracks().forEach(t=>pc.addTrack(t,nostrVoice._localStream));
    pc.ontrack=function(ev){
      if(!peer.audioEl){peer.audioEl=new Audio();peer.audioEl.autoplay=true;peer.audioEl.muted=state.voiceDeafened;document.body.appendChild(peer.audioEl);}
      peer.audioEl.srcObject=ev.streams[0];
    };
    pc.onicecandidate=function(ev){if(ev.candidate) peer.bufferedCandidates.push(ev.candidate.toJSON());};
    pc.onicegatheringstatechange=function(){
      if(pc.iceGatheringState==='complete'&&peer.bufferedCandidates.length){nostrVoice._publishSignal(peerPubkey,'ice',peer.bufferedCandidates);peer.bufferedCandidates=[];}
    };
    pc.onconnectionstatechange=function(){
      if(pc.connectionState==='connected'){var p=nostrVoice._participants.get('nostr-'+peerPubkey.slice(0,12));if(p){p.connectionQuality='good';nostrVoice.updateParticipants();}}
      if(pc.connectionState==='failed'||pc.connectionState==='closed') nostrVoice._closePeer(peerPubkey);
    };
    if(state.nostrPubkey>peerPubkey)
      pc.createOffer().then(o=>pc.setLocalDescription(o).then(()=>{
        nostrVoice._publishSignal(peerPubkey,'offer',o);
        peer.iceTimer=setTimeout(()=>{if(peer.bufferedCandidates.length&&pc.iceGatheringState!=='complete'){nostrVoice._publishSignal(peerPubkey,'ice',peer.bufferedCandidates);peer.bufferedCandidates=[];}},4000);
      })).catch(e=>console.warn('[nostr-voice] offer:',e));
  },

  _handleSignal(event) {
    var from=event.pubkey; if(from===state.nostrPubkey) return;
    var data; try{data=JSON.parse(event.content);}catch(e){return;} if(!data?.type) return;
    if(!nostrVoice._peers.has(from)) nostrVoice._maybeConnect(from);
    var peer=nostrVoice._peers.get(from); if(!peer) return;
    var pc=peer.pc;
    var drainBuf=()=>{peer.bufferedCandidates.forEach(c=>pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{}));peer.bufferedCandidates=[];};
    if(data.type==='offer'&&pc.signalingState==='stable')
      pc.setRemoteDescription(new RTCSessionDescription(data.data)).then(()=>{peer.remoteDescSet=true;drainBuf();return pc.createAnswer();})
        .then(a=>pc.setLocalDescription(a).then(()=>{
          nostrVoice._publishSignal(from,'answer',a);
          peer.iceTimer=setTimeout(()=>{if(peer.bufferedCandidates.length&&pc.iceGatheringState!=='complete'){nostrVoice._publishSignal(from,'ice',peer.bufferedCandidates);peer.bufferedCandidates=[];}},4000);
        })).catch(e=>console.warn('[nostr-voice] answer:',e));
    else if(data.type==='answer'&&pc.signalingState==='have-local-offer')
      pc.setRemoteDescription(new RTCSessionDescription(data.data)).then(()=>{peer.remoteDescSet=true;drainBuf();}).catch(e=>console.warn('[nostr-voice] set-answer:',e));
    else if(data.type==='ice'){
      var cands=Array.isArray(data.data)?data.data:[data.data];
      if(peer.remoteDescSet) cands.forEach(c=>pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{}));
      else peer.bufferedCandidates.push(...cands);
    }
  },

  _subscribeSignals() {
    if(!nostrVoice._roomId||!state.nostrPubkey) return;
    var base='zellous-rtc:'+nostrVoice._roomId+':'+state.nostrPubkey;
    nostrNet.subscribe('voice-signals-'+nostrVoice._roomId,
      [{kinds:[30078],'#d':[base+':sdp',base+':ice'],since:nostrVoice._joinTs-60}],
      nostrVoice._handleSignal,()=>{});
  },

  async _publishSignal(toPubkey,type,data) {
    if(!state.nostrPubkey||!nostrVoice._roomId) return;
    nostrNet.publish(await auth.sign({kind:30078,created_at:Math.floor(Date.now()/1000),
      tags:[['d','zellous-rtc:'+nostrVoice._roomId+':'+toPubkey+':'+(type==='ice'?'ice':'sdp')]],
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
    nostrVoice._presenceInterval=setInterval(()=>{if(state.voiceConnected) nostrVoice._publishPresence('heartbeat');},30000);
  },

  _stopHeartbeat() { if(nostrVoice._presenceInterval){clearInterval(nostrVoice._presenceInterval);nostrVoice._presenceInterval=null;} },

  _subscribePresence() {
    if(!nostrVoice._roomId) return;
    nostrNet.subscribe('voice-presence-'+nostrVoice._roomId,
      [{kinds:[30078],'#d':['zellous-voice:'+nostrVoice._roomId],since:Math.floor(Date.now()/1000)-90}],
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
          }
          nostrVoice.updateParticipants();
        } catch(e){}
      },()=>{});
  },

  isDataChannelReady:()=>false,
  updateVoiceGrid(){nostrVoice.updateParticipants();}
};

window.lk=nostrVoice;
window.nostrVoice=nostrVoice;
