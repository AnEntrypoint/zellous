export function installDm(ww) {
  const a = ww.auth;
  // DM bridge — NIP-44 encrypted 1:1 (kind 14), structurally isolated from
  // the plaintext broadcast Chat (kind 42 filtered by channel-hash '#e' tag).
  // DM.subscribe filters by '#p'/authors on the user's own pubkey, so a DM
  // event can never satisfy a channel chat subscription's kind/tag filter,
  // and vice versa — no shared array, no shared subscription id.
  const DM_MESSAGES_CAP = 500;
  let dmMessages = [];
  let dmSubId = null;
  window.dm = {
    get messages() { return dmMessages.slice(); },
    async send(peerPubkey, text) {
      if (!peerPubkey || !text?.trim()) return null;
      const ev = await ww.ensureDM().send(peerPubkey, text.trim());
      dmMessages.push({ id: ev.id, peer: peerPubkey, from: a.pubkey, text: text.trim(), timestamp: Date.now(), mine: true, pending: true });
      if (dmMessages.length > DM_MESSAGES_CAP) dmMessages = dmMessages.slice(dmMessages.length - DM_MESSAGES_CAP);
      state.dmMessages = dmMessages.slice();
      if (window.ui) ui.render.all();
      return ev;
    },
    reset() {
      try { ww.ensureDM().unsubscribe(); } catch {}
      dmSubId = null;
      dmMessages = [];
    },
    subscribeAll() {
      if (dmSubId || !a.pubkey) return dmSubId;
      dmSubId = ww.ensureDM().subscribe(({ event, rumor, plaintext, peer }) => {
        const id = rumor.id || event.id;
        if (dmMessages.find(m => m.id === id)) return;
        const mine = rumor.pubkey === a.pubkey;
        if (mine) dmMessages = dmMessages.filter(m => !(m.pending && m.peer === peer && m.text === plaintext));
        dmMessages.push({ id, peer, from: rumor.pubkey, text: plaintext, timestamp: rumor.created_at * 1000, mine });
        dmMessages.sort((x, y) => x.timestamp - y.timestamp);
        if (dmMessages.length > DM_MESSAGES_CAP) dmMessages = dmMessages.slice(dmMessages.length - DM_MESSAGES_CAP);
        state.dmMessages = dmMessages.slice();
        if (window.ui) ui.render.all();
      });
      return dmSubId;
    }
  };
}
