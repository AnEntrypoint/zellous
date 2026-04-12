var nostrVoiceSfu = {
  _mode: 'mesh',
  _hub: null,
  _rttMatrix: new Map(),
  _electionTimer: null,
  _statsInterval: null,

  start() {
    nostrVoiceSfu._stopStats();
    nostrVoiceSfu._statsInterval = setInterval(nostrVoiceSfu._poll, 5000);
  },

  stop() {
    nostrVoiceSfu._stopStats();
    nostrVoiceSfu._mode = 'mesh';
    nostrVoiceSfu._hub = null;
    nostrVoiceSfu._rttMatrix.clear();
  },

  _stopStats() {
    if(nostrVoiceSfu._statsInterval) { clearInterval(nostrVoiceSfu._statsInterval); nostrVoiceSfu._statsInterval = null; }
    if(nostrVoiceSfu._electionTimer) { clearTimeout(nostrVoiceSfu._electionTimer); nostrVoiceSfu._electionTimer = null; }
  },

  async _poll() {
    var nv = nostrVoice;
    var scores = {};
    var tasks = [];
    nv._peers.forEach(function(peer, pk) {
      if(!peer.pc || peer.pc.connectionState !== 'connected') return;
      tasks.push(peer.pc.getStats().then(function(stats) {
        stats.forEach(function(r) {
          if(r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime != null) {
            scores[pk] = Math.round(r.currentRoundTripTime * 1000);
          }
        });
      }).catch(function(){}));
    });
    await Promise.all(tasks);
    nostrVoiceSfu._rttMatrix.set(state.nostrPubkey, scores);
    nostrVoiceSfu._maybeElect();
  },

  onPresenceRtt(pubkey, rttScores) {
    if(rttScores && typeof rttScores === 'object') nostrVoiceSfu._rttMatrix.set(pubkey, rttScores);
    nostrVoiceSfu._maybeElect();
  },

  _maybeElect() {
    var nv = nostrVoice;
    var peerCount = nv._peers.size;
    if(peerCount < 3) { if(nostrVoiceSfu._mode !== 'mesh') nostrVoiceSfu._dissolve(); return; }
    if(nostrVoiceSfu._electionTimer) return;
    nostrVoiceSfu._electionTimer = setTimeout(function() {
      nostrVoiceSfu._electionTimer = null;
      nostrVoiceSfu._elect();
    }, 2000);
  },

  _elect() {
    var nv = nostrVoice;
    var allPeers = [state.nostrPubkey];
    nv._peers.forEach(function(_, pk) { allPeers.push(pk); });
    var best = null, bestAvg = Infinity;
    allPeers.forEach(function(pk) {
      var scores = nostrVoiceSfu._rttMatrix.get(pk);
      if(!scores) return;
      var vals = Object.values(scores).filter(function(v) { return typeof v === 'number'; });
      if(!vals.length) return;
      var avg = vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
      if(avg < bestAvg || (avg === bestAvg && pk > best)) { bestAvg = avg; best = pk; }
    });
    if(!best) return;
    if(best !== nostrVoiceSfu._hub) {
      nostrVoiceSfu._hub = best;
      nostrVoiceSfu._mode = 'star';
      if(best === state.nostrPubkey) nostrVoiceSfu._becomeHub();
      else nostrVoiceSfu._routeToHub(best);
    }
  },

  _becomeHub() {
    var nv = nostrVoice;
    nv._peers.forEach(function(srcPeer, srcPk) {
      if(!srcPeer.pc || !srcPeer.pc.getReceivers) return;
      srcPeer.pc.getReceivers().forEach(function(recv) {
        if(!recv.track || recv.track.kind !== 'audio') return;
        nv._peers.forEach(function(dstPeer, dstPk) {
          if(dstPk === srcPk) return;
          var sender = dstPeer.pc && dstPeer.pc.getSenders().find(function(s) { return s.track && s.track.kind === 'audio'; });
          if(sender) sender.replaceTrack(recv.track).catch(function(){});
        });
      });
    });
  },

  _routeToHub(hubPk) {
    var nv = nostrVoice;
    nv._peers.forEach(function(peer, pk) {
      if(pk === hubPk) return;
      nostrVoice._closePeer(pk);
      nv._peers.delete(pk);
    });
    if(!nv._peers.has(hubPk)) nostrVoiceRtc.maybeConnect(hubPk);
  },

  _dissolve() {
    nostrVoiceSfu._mode = 'mesh';
    nostrVoiceSfu._hub = null;
  },

  get __debug() {
    var scores = {};
    nostrVoiceSfu._rttMatrix.forEach(function(v, k) { scores[k.slice(0,12)] = v; });
    return {mode: nostrVoiceSfu._mode, hub: nostrVoiceSfu._hub ? nostrVoiceSfu._hub.slice(0,12) : null, rttMatrix: scores};
  }
};
window.nostrVoiceSfu = nostrVoiceSfu;
