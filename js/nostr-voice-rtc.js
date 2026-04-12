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

  maybeConnect(peerPubkey) {
    var nv=nostrVoice;
    if(!peerPubkey||peerPubkey===state.nostrPubkey||nv._peers.has(peerPubkey)) return;
    var fsm=nv._peerFSM(peerPubkey);
    var peer={pc:null,audioEl:null,pendingCandidates:[],bufferedCandidates:[],iceTimer:null,disconnectTimer:null,failCount:0,state:'new',fsm:fsm};
    nv._peers.set(peerPubkey,peer);
    var pc=new RTCPeerConnection({iceServers:nostrVoiceRtc._iceServers,bundlePolicy:'max-bundle'}); peer.pc=pc;
    if(nv._localStream)
      nv._localStream.getTracks().forEach(t=>pc.addTransceiver(t,{direction:'sendrecv',streams:[nv._localStream]}));
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
        fsm.send('restart'); pc.restartIce();
        pc.createOffer({iceRestart:true}).then(o=>pc.setLocalDescription(o).then(()=>nv._publishSignal(peerPubkey,'offer',o))).catch(()=>nv._closePeer(peerPubkey));
      } else { nv._closePeer(peerPubkey); }
    };
    pc.onconnectionstatechange=function(){
      if(pc.connectionState==='connected'){
        peer.failCount=0; if(fsm.can('recv_answer')) fsm.send('recv_answer');
        if(peer.disconnectTimer){clearTimeout(peer.disconnectTimer);peer.disconnectTimer=null;}
        nostrVoiceRtc._applyOpusCbr(pc);
        var p=nv._participants.get('nostr-'+peerPubkey.slice(0,12));
        if(p){p.connectionQuality='good';nv.updateParticipants();}
      }
      if(pc.connectionState==='disconnected'){
        fsm.send('disconnect'); peer.disconnectTimer=setTimeout(doIceRestart,8000);
      }
      if(pc.connectionState==='failed') doIceRestart();
      if(pc.connectionState==='closed') nv._closePeer(peerPubkey);
    };
    var isOfferer=state.nostrPubkey>peerPubkey;
    if(isOfferer){
      fsm.send('offer');
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
    if(data.type==='offer'&&(pc.signalingState==='stable'||pc.signalingState==='have-remote-offer')){
      if(fsm.can('recv_offer')) fsm.send('recv_offer');
      pc.setRemoteDescription(new RTCSessionDescription(data.data)).then(()=>{peer.remoteDescSet=true;drainBuf();return pc.createAnswer();})
        .then(a=>pc.setLocalDescription(a).then(()=>{
          fsm.send('sent_answer');
          nv._publishSignal(from,'answer',a);
        })).catch(e=>console.warn('[nostr-voice] answer:',e));
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
window.nostrVoiceRtc = nostrVoiceRtc;
