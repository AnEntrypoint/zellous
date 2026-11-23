export function installDm(ww) {
  const a = ww.auth;
  const DM_MESSAGES_CAP = 500;
  let dmMessages = [];
  let dmSubId = null;
  const publish = () => { state.dmMessages = dmMessages.slice(); if (window.ui) ui.render.all(); };
  ww.pool.addEventListener('publish-status', (e) => {
    const { id, ...send } = e.detail;
    const i = dmMessages.findIndex((m) => m.wrapId === id);
    if (i < 0) return;
    dmMessages[i] = { ...dmMessages[i], send };
    publish();
  });
  const seenByPeer = {};
  const sentUpTo = {};
  const maybeSendReceipt = () => {
    const peer = state.activeDmPeer;
    if (!peer || document.visibilityState === 'hidden' || !window.nostrAccount || !window.nostrAccount.receiptsOn()) return;
    const latest = dmMessages.filter((m) => !m.mine && m.peer === peer).reduce((t, m) => Math.max(t, m.timestamp), 0);
    if (!latest || latest <= (sentUpTo[peer] || 0)) return;
    sentUpTo[peer] = latest;
    ww.ensureDM().sendReceipt(peer, latest / 1000).catch(() => { sentUpTo[peer] = 0; });
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') maybeSendReceipt(); });
  window.dm = {
    seenUpTo: (peer) => seenByPeer[peer] || 0,
    maybeSendReceipt,
    get messages() { return dmMessages.slice(); },
    async send(peerPubkey, text) {
      if (!peerPubkey || !text?.trim()) return null;
      const ev = await ww.ensureDM().send(peerPubkey, text.trim());
      const send = ww.pool.publishStatus(ev.id);
      dmMessages.push({ id: ev.id, wrapId: ev.id, peer: peerPubkey, from: a.pubkey, text: text.trim(), timestamp: Date.now(), mine: true, pending: true, send: send ? (({ id, ...rest }) => rest)(send) : { state: 'pending', ok: 0, failed: 0, total: 0, failures: [] } });
      if (dmMessages.length > DM_MESSAGES_CAP) dmMessages = dmMessages.slice(dmMessages.length - DM_MESSAGES_CAP);
      publish();
      return ev;
    },
    retry(id) {
      const m = dmMessages.find((x) => x.id === id);
      return !!(m && m.wrapId && ww.pool.retryPublish(m.wrapId));
    },
    reset() {
      try { ww.ensureDM().unsubscribe(); } catch {}
      dmSubId = null;
      dmMessages = [];
      state.dmMessages = [];
      if (window.ui) ui.render.all();
    },
    subscribeAll() {
      if (dmSubId || !a.pubkey) return dmSubId;
      dmSubId = ww.ensureDM().subscribe(({ event, rumor, plaintext, peer }) => {
        if (rumor.kind === 7 && (rumor.tags || []).some((t) => t[0] === 't' && t[1] === 'zellous-read')) {
          const seen = Number(((rumor.tags || []).find((t) => t[0] === 'seen') || [])[1]) || 0;
          if (rumor.pubkey !== a.pubkey && seen * 1000 > (seenByPeer[rumor.pubkey] || 0)) { seenByPeer[rumor.pubkey] = seen * 1000; if (state.dmReadVersion !== undefined) state.dmReadVersion = (state.dmReadVersion || 0) + 1; }
          return;
        }
        const id = rumor.id || event.id;
        if (dmMessages.find(m => m.id === id)) return;
        const mine = rumor.pubkey === a.pubkey;
        if (!mine && window.nostrAccount && !window.nostrAccount.allowsDm(peer, new Set(dmMessages.filter((m) => m.mine).map((m) => m.peer)))) return;
        const pending = mine ? dmMessages.find((m) => m.pending && m.peer === peer && m.text === plaintext) : null;
        if (mine) dmMessages = dmMessages.filter((m) => m !== pending);
        dmMessages.push({ id, peer, from: rumor.pubkey, text: plaintext, timestamp: rumor.created_at * 1000, mine, ...(pending ? { wrapId: pending.wrapId, send: pending.send } : {}) });
        dmMessages.sort((x, y) => x.timestamp - y.timestamp);
        setTimeout(maybeSendReceipt, 400);
        if (dmMessages.length > DM_MESSAGES_CAP) dmMessages = dmMessages.slice(dmMessages.length - DM_MESSAGES_CAP);
        publish();
      });
      return dmSubId;
    }
  };
}
