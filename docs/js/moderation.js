const moderation = {
  async banUserNostr(serverId, pubkey) { return window.nostrBans.ban(serverId, pubkey); },
  async timeoutUserNostr(serverId, pubkey, minutes) { return window.nostrBans.timeout(serverId, pubkey, minutes); },
  async kickFromVoice(pubkey) {
    if (window.nostrVoice?._peers?.get) {
      try { window.nostrVoice._peers.get(pubkey); } catch {}
    }
    return window.nostrBans.kickFromVoice(pubkey);
  },

  showMemberMenu(memberId, memberName, x, y) {
    const serverId = state.currentServerId;
    const canManage = serverId && window.serverRoles && serverRoles.isAdmin(serverId);
    if (!canManage) return;
    const isOwner = serverId && window.serverRoles && serverRoles.isOwner(serverId);

    const guard = (fn) => async () => { try { await fn(); } catch (err) { console.warn('[Mod]', err.message); } };
    const items = [];
    if (isOwner) items.push({ label: 'Set Admin', onSelect: guard(() => serverRoles.setRole(serverId, memberId, 'admin')) });
    items.push({ label: 'Set Moderator', onSelect: guard(() => serverRoles.setRole(serverId, memberId, 'moderator')) });
    items.push({ label: 'Set Member', onSelect: guard(() => serverRoles.setRole(serverId, memberId, 'member')) });
    if (window.nostrVoice?._peers?.has(memberId)) {
      items.push({ label: 'Kick from Voice', danger: true, onSelect: guard(() => confirm(`Kick ${memberName} from voice?`) && moderation.kickFromVoice(memberId)) });
    }
    items.push({ label: 'Ban User', danger: true, onSelect: guard(() => confirm(`Ban ${memberName}?`) && moderation.banUserNostr(serverId, memberId)) });
    items.push({ label: 'Timeout 10m', danger: true, onSelect: guard(() => confirm(`Timeout ${memberName} for 10 minutes?`) && moderation.timeoutUserNostr(serverId, memberId, 10)) });
    items.push({ label: 'Timeout 1h', danger: true, onSelect: guard(() => confirm(`Timeout ${memberName} for 1 hour?`) && moderation.timeoutUserNostr(serverId, memberId, 60)) });

    if (window.__contextMenu) window.__contextMenu.show(items, x, y);
  },

  roleLabel(role) { return { owner: 'Owner', admin: 'Admin', moderator: 'Mod', member: '' }[role] || ''; },
  roleBadgeColor(role) { return (window.ROLE_COLOR || {})[role] || null; }
};

window.__zellous.moderation = moderation;
window.moderation = moderation;
