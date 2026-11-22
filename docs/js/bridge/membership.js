export function installMembership(ww) {
  const m = ww.membership;
  const chat = ww.chat;
  const announceWhenReady = async (serverId) => {
    for (let i = 0; i < 40; i++) {
      const st = window.state;
      if (st.currentServerId === serverId && st.currentChannel && st.currentChannel.id) { await chat.announceJoin(serverId, st.currentChannel.id); return; }
      await new Promise((r) => setTimeout(r, 150));
    }
  };
  window.nostrMembership = {
    parseJoin: m.parseJoin,
    parseWave: m.parseWave,
    parseInvite: m.parseInvite,
    wave: (pubkey) => chat.send(m.waveContent(pubkey)),
    invite: (serverId, name, color) => chat.send(m.inviteContent({ serverId, name, color })),
    announceWhenReady,
  };
}
