window.__voiceRetrySchedule = window.__voiceRetrySchedule || {};
var nostrVoiceRtc = {
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

  _applyAudioHints(pc) {
    try {
      pc.getSenders().forEach(function(sender) {
        if(!sender.track||sender.track.kind!=='audio') return;
        var params=sender.getParameters();
        if(!params.encodings||!params.encodings.length) return;
        params.encodings[0].networkPriority='high'; params.encodings[0].priority='high';
        params.encodings[0].maxBitrate=48000;
        sender.setParameters(params).catch(function(){});
      });
      pc.getReceivers().forEach(function(recv) {
        if(!recv.track||recv.track.kind!=='audio') return;
        try { recv.playoutDelayHint=0.02; } catch(e) {}
      });
    } catch(e) {}
  },

  maybeConnect(peerPubkey) {
    var nv=nostrVoice;
    if(!peerPubkey||peerPubkey===state.nostrPubkey||nv._peers.has(peerPubkey)) return;
    if(window.nostrBans&&state.currentServerId&&(nostrBans.isBanned(state.currentServerId,peerPubkey)||nostrBans.isTimedOut(state.currentServerId,peerPubkey))) return;
    nostrVoiceRtc.cancelReconnect(peerPubkey);
    var fsm=XState.createActor(nostrFsm.peerMachine);
    fsm.subscribe(function(snap){var p=nv._peers.get(peerPubkey);if(p)p.state=snap.value;});
    fsm.start();
    var peer={pc:null,audioEl:null,pendingCandidates:[],bufferedCandidates:[],iceTimer:null,disconnectTimer:null,failCount:0,state:'new',fsm:fsm};
    nv._peers.set(peerPubkey,peer);
    var pc=new RTCPeerConnection({iceServers:nostrVoiceRtc._iceServers,bundlePolicy:'max-bundle'}); peer.pc=pc;
    var isOfferer=state.nostrPubkey>peerPubkey;
    if(isOfferer){
      if(nv._localStream)
        nv._localStream.getTracks().forEach(t=>pc.addTransceiver(t,{direction:'sendrecv',streams:[nv._localStream]}));
      else
        pc.addTransceiver('audio',{direction:'recvonly'});
    }
    pc.ontrack=function(ev){
      if(ev.track.kind==='video'){
        var pKey='nostr-'+peerPubkey.slice(0,12);
        var p=nv._participants.get(pKey);
        if(p){p.hasVideo=true;p._videoStream=ev.streams[0];}
        var el=document.getElementById('vtile-video-'+peerPubkey.slice(0,8));
        if(!el){el=document.createElement('video');el.id='vtile-video-'+peerPubkey.slice(0,8);el.autoplay=true;el.playsinline=true;el.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:8px';var wrap=document.getElementById('vtile-wrap-'+peerPubkey.slice(0,8));if(wrap){wrap.appendChild(el);}}
        el.srcObject=ev.streams[0];
        nv.updateParticipants();
        return;
      }
      if(!peer.audioEl){peer.audioEl=new Audio();peer.audioEl.autoplay=true;peer.audioEl.muted=state.voiceDeafened;document.body.appendChild(peer.audioEl);}
      peer.audioEl.srcObject=ev.streams[0];
      try { ev.receiver.playoutDelayHint=0.02; } catch(e) {}
      ev.track.onended=function(){
        if(!peer.fsm.getSnapshot().matches('connected')) return;
        if(window.__debug) window.__debug['rtc-track-ended-'+peerPubkey.slice(0,8)]=Date.now();
        doIceRestart();
      };
      if(!peer._stallInterval) peer._stallInterval=setInterval(function(){
        if(!peer.audioEl||!peer.audioEl.srcObject) return;
        if(!peer.fsm.getSnapshot().matches('connected')) return;
        if(peer.trackEndedRestart) return;
        var allEnded=peer.audioEl.srcObject.getTracks().every(function(t){return t.readyState==='ended';});
        if(!allEnded) return;
        peer.trackEndedRestart=true;
        if(window.__debug) window.__debug['rtc-stall-'+peerPubkey.slice(0,8)]=Date.now();
        doIceRestart();
      },5000);
    };
    pc.onicecandidate=function(ev){
      if(!ev.candidate) return;
      peer.pendingCandidates.push(ev.candidate.toJSON());
      if(peer.iceTimer) clearTimeout(peer.iceTimer);
      peer.iceTimer=setTimeout(function(){
        if(peer.pendingCandidates.length){nv._publishSignal(peerPubkey,'ice',peer.pendingCandidates.splice(0));peer.iceTimer=null;}
      },500);
    };
    pc.onicegatheringstatechange=function(){
      if(pc.iceGatheringState==='complete'){
        if(peer.iceTimer){clearTimeout(peer.iceTimer);peer.iceTimer=null;}
        if(peer.pendingCandidates.length){nv._publishSignal(peerPubkey,'ice',peer.pendingCandidates.splice(0));}
      }
    };
    var doIceRestart=function(){
      if(peer.disconnectTimer){clearTimeout(peer.disconnectTimer);peer.disconnectTimer=null;}
      peer.failCount++;
      if(peer.failCount<=1&&state.nostrPubkey>peerPubkey){
        fsm.send({type:'restart'}); pc.restartIce();
        pc.createOffer({iceRestart:true}).then(o=>pc.setLocalDescription(o).then(()=>nv._publishSignal(peerPubkey,'offer',o))).catch(()=>nv._closePeer(peerPubkey));
      } else { nv._closePeer(peerPubkey); nostrVoiceRtc.scheduleReconnect(peerPubkey, peer.failCount); }
    };
    pc.onconnectionstatechange=function(){
      if(pc.connectionState==='connected'){
        peer.failCount=0; nostrVoiceRtc.cancelReconnect(peerPubkey);
        if(fsm.getSnapshot().can({type:'recv_answer'})) fsm.send({type:'recv_answer'});
        if(peer.disconnectTimer){clearTimeout(peer.disconnectTimer);peer.disconnectTimer=null;}
        nostrVoiceRtc._applyAudioHints(pc);
        var pKey='nostr-'+peerPubkey.slice(0,12);
        var p=nv._participants.get(pKey);
        if(!p){nv._participants.set(pKey,{identity:pKey,isSpeaking:false,isMuted:false,isLocal:false,hasVideo:false,connectionQuality:'good',_peerPubkey:peerPubkey});}
        else{p.connectionQuality='good';p._peerPubkey=peerPubkey;}
        nv.updateParticipants();
      }
      if(pc.connectionState==='disconnected'){
        fsm.send({type:'disconnect'}); peer.disconnectTimer=setTimeout(doIceRestart,8000);
      }
      if(pc.connectionState==='failed') doIceRestart();
      if(pc.connectionState==='closed'){nv._closePeer(peerPubkey);if(window.nostrVoiceSfu&&nostrVoiceSfu._hub===peerPubkey){nostrVoiceSfu._dissolve();setTimeout(nostrVoiceSfu._maybeElect,500);}}
    };
    if(isOfferer){
      fsm.send({type:'offer'});
      pc.createOffer().then(o=>pc.setLocalDescription(o).then(()=>nv._publishSignal(peerPubkey,'offer',o)))
        .catch(e=>console.warn('[nostr-voice] offer:',e));
    }
  },

  handleSignal(event) {
    var nv=nostrVoice;
    var from=event.pubkey; if(from===state.nostrPubkey) return;
    var data; try{data=JSON.parse(event.content);}catch(e){return;} if(!data?.type) return;
    if(!nv._peers.has(from)) nostrVoiceRtc.maybeConnect(from);
    var peer=nv._peers.get(from); if(!peer) return;
    var pc=peer.pc; var fsm=peer.fsm;
    var addCands=function(cands){cands.forEach(c=>pc.addIceCandidate(new RTCIceCandidate(c)).catch(e=>console.error('[nostr-voice] ice:',e)));};
    var drainBuf=function(){addCands(peer.bufferedCandidates);peer.bufferedCandidates=[];};
    var doAnswer=function(){if(fsm.getSnapshot().can({type:'recv_offer'}))fsm.send({type:'recv_offer'});return pc.setRemoteDescription(new RTCSessionDescription(data.data)).then(function(){peer.remoteDescSet=true;drainBuf();var hasAudioTx=pc.getTransceivers().some(function(t){return t.receiver.track&&t.receiver.track.kind==='audio';});if(!hasAudioTx)pc.addTransceiver('audio',{direction:nv._localStream?'sendrecv':'recvonly'});if(nv._localStream){var hasSender=pc.getSenders().some(function(s){return s.track&&s.track.kind==='audio';});if(!hasSender)nv._localStream.getTracks().forEach(function(t){pc.addTrack(t,nv._localStream);});}return pc.createAnswer();}).then(function(a){return pc.setLocalDescription(a).then(function(){fsm.send({type:'sent_answer'});nv._publishSignal(from,'answer',a);});}).catch(function(e){console.warn('[nostr-voice] answer:',e);});};
    if(data.type==='offer'){
      var polite=state.nostrPubkey<from;
      var collision=pc.signalingState!=='stable';
      if(collision&&!polite) return;
      if(collision&&polite){pc.setLocalDescription({type:'rollback'}).then(doAnswer).catch(function(e){console.warn('[nostr-voice] rollback:',e);});return;}
      doAnswer();
    } else if(data.type==='answer'&&pc.signalingState==='have-local-offer'){
      pc.setRemoteDescription(new RTCSessionDescription(data.data)).then(()=>{peer.remoteDescSet=true;drainBuf();}).catch(e=>console.warn('[nostr-voice] set-answer:',e));
    } else if(data.type==='ice'){
      var cands=Array.isArray(data.data)?data.data:[data.data];
      if(peer.remoteDescSet) addCands(cands);
      else peer.bufferedCandidates.push(...cands);
    }
  },

  subscribe(roomId,pubkey) {
    nostrNet.subscribe('voice-signals-'+roomId,
      [{kinds:[30078],'#p':[pubkey],'#r':[roomId]}],
      nostrVoiceRtc.handleSignal,()=>{});
  },

  async publish(toPubkey,type,data,roomId) {
    if(!state.nostrPubkey||!roomId) return;
    var d='zellous-rtc:'+roomId+':'+state.nostrPubkey+':'+toPubkey+':'+type+':'+(type==='ice'?Date.now():'sdp');
    nostrNet.publish(await auth.sign({kind:30078,created_at:Math.floor(Date.now()/1000),
      tags:[['d',d],['p',toPubkey],['r',roomId]],
      content:JSON.stringify({type,data})}));
  }
};
window.__zellous.voiceRtc = nostrVoiceRtc;
window.nostrVoiceRtc = nostrVoiceRtc;

nostrVoiceRtc.cancelReconnect = function(pk) {
  var e=window.__voiceRetrySchedule[pk]; if(e){clearTimeout(e.timer);delete window.__voiceRetrySchedule[pk];}
};
nostrVoiceRtc.scheduleReconnect = function(pk, attempt) {
  var a=attempt||0; if(a>=6) return;
  nostrVoiceRtc.cancelReconnect(pk);
  var timer=setTimeout(function(){
    delete window.__voiceRetrySchedule[pk];
    var nv=nostrVoice; if(!nv._peers.has(pk)&&nv._roomId) nostrVoiceRtc.maybeConnect(pk);
  }, Math.min(Math.pow(2,a)*2000,30000));
  window.__voiceRetrySchedule[pk]={attempt:a,timer:timer};
  if(window.__debug&&window.__debug.voice) window.__debug.voice.retrySchedule=window.__voiceRetrySchedule;
};

var _healDebounce=null,_pagehidden=false,_BAD={disconnected:1,failed:1,closed:1};
function _healPeers(){
  if(_healDebounce){clearTimeout(_healDebounce);_healDebounce=null;}
  _healDebounce=setTimeout(function(){
    _healDebounce=null; var nv=nostrVoice; if(!nv._roomId) return;
    nv._peers.forEach(function(peer,pk){if(_BAD[peer.pc&&peer.pc.connectionState]){nv._closePeer(pk);nostrVoiceRtc.scheduleReconnect(pk,0);}});
  },500);
}
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='hidden'){_pagehidden=true;return;}
  if(_pagehidden){_pagehidden=false;_healPeers();}
});
window.addEventListener('online',function(){
  var nv=nostrVoice; if(!nv._roomId) return;
  if(window.nostrNet&&nostrNet.reconnectAll) nostrNet.reconnectAll();
  _healPeers();
});
window.addEventListener('pageshow',function(ev){if(ev.persisted||_pagehidden){_pagehidden=false;_healPeers();}});
