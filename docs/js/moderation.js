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
    document.getElementById('memberContextMenu')?.remove();
    const serverId = state.currentServerId;
    const menu = document.createElement('div');
    menu.id = 'memberContextMenu';
    menu.className = 'context-menu';
    menu.style.cssText = `position:fixed;top:${y}px;left:${x}px;z-index:2500`;

    let items = '';
    const canManage = serverId && window.serverRoles && serverRoles.isAdmin(serverId);
    const isOwner = serverId && window.serverRoles && serverRoles.isOwner(serverId);
    if (canManage) {
      if (isOwner) items += `<div class="context-menu-item" data-action="role-admin">Set Admin</div>`;
      items += `<div class="context-menu-item" data-action="role-mod">Set Moderator</div>`;
      items += `<div class="context-menu-item" data-action="role-member">Set Member</div>`;
    }
    if (canManage && window.nostrVoice?._peers?.has(memberId)) {
      items += `<div class="context-menu-item danger" data-action="kick-voice">Kick from Voice</div>`;
    }
    if (canManage) {
      items += `<div class="context-menu-item danger" data-action="ban">Ban User</div>`;
      items += `<div class="context-menu-item danger" data-action="timeout-10">Timeout 10m</div>`;
      items += `<div class="context-menu-item danger" data-action="timeout-60">Timeout 1h</div>`;
    }
    menu.innerHTML = items;
    if (!items) return;
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';

    menu.addEventListener('click', async (e) => {
      const action = e.target.dataset.action;
      menu.remove();
      try {
        if (action === 'kick-voice' && confirm(`Kick ${memberName} from voice?`)) await moderation.kickFromVoice(memberId);
        else if (action === 'ban' && confirm(`Ban ${memberName}?`)) await moderation.banUserNostr(serverId, memberId);
        else if (action === 'role-admin') await serverRoles.setRole(serverId, memberId, 'admin');
        else if (action === 'role-mod') await serverRoles.setRole(serverId, memberId, 'moderator');
        else if (action === 'role-member') await serverRoles.setRole(serverId, memberId, 'member');
        else if (action === 'timeout-10' && confirm(`Timeout ${memberName} for 10 minutes?`)) await moderation.timeoutUserNostr(serverId, memberId, 10);
        else if (action === 'timeout-60' && confirm(`Timeout ${memberName} for 1 hour?`)) await moderation.timeoutUserNostr(serverId, memberId, 60);
      } catch (err) { console.warn('[Mod]', err.message); }
    });

    const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  },

  roleLabel(role) { return { owner: 'Owner', admin: 'Admin', moderator: 'Mod', member: '' }[role] || ''; },
  roleBadgeColor(role) { return { owner: '#feb347', admin: '#5865f2', moderator: '#57f287' }[role] || null; }
};

window.__zellous.moderation = moderation;
window.moderation = moderation;
