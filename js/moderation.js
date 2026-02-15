const moderation = {
  _headers() {
    const h = { 'Content-Type': 'application/json' };
    const token = auth?.getToken();
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  },

  async deleteMessage(messageId) {
    const res = await fetch(`/api/rooms/${state.roomId}/messages/${messageId}`, {
      method: 'DELETE', headers: this._headers()
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    return true;
  },

  async kickUser(serverId, userId) {
    const res = await fetch(`/api/servers/${serverId}/kick/${userId}`, {
      method: 'POST', headers: this._headers()
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    return true;
  },

  async banUser(serverId, userId) {
    const res = await fetch(`/api/servers/${serverId}/ban/${userId}`, {
      method: 'POST', headers: this._headers()
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    return true;
  },

  async setRole(serverId, userId, role) {
    const res = await fetch(`/api/servers/${serverId}/roles/${userId}`, {
      method: 'PATCH', headers: this._headers(),
      body: JSON.stringify({ role })
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    return true;
  },

  showMemberMenu(memberId, memberName, x, y) {
    document.getElementById('memberContextMenu')?.remove();
    const serverId = state.currentServerId;
    const menu = document.createElement('div');
    menu.id = 'memberContextMenu';
    menu.className = 'context-menu';
    menu.style.cssText = `position:fixed;top:${y}px;left:${x}px;z-index:2500`;

    let items = '';
    if (serverId) {
      items += `<div class="context-menu-item" data-action="role-mod">Set Moderator</div>`;
      items += `<div class="context-menu-item" data-action="role-admin">Set Admin</div>`;
      items += `<div class="context-menu-item" data-action="role-member">Set Member</div>`;
      items += `<div class="context-menu-item danger" data-action="kick">Kick</div>`;
      items += `<div class="context-menu-item danger" data-action="ban">Ban</div>`;
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
        if (action === 'kick') { if (confirm(`Kick ${memberName}?`)) await moderation.kickUser(serverId, memberId); }
        else if (action === 'ban') { if (confirm(`Ban ${memberName}?`)) await moderation.banUser(serverId, memberId); }
        else if (action === 'role-mod') await moderation.setRole(serverId, memberId, 'moderator');
        else if (action === 'role-admin') await moderation.setRole(serverId, memberId, 'admin');
        else if (action === 'role-member') await moderation.setRole(serverId, memberId, 'member');
      } catch (e) { console.warn('[Mod]', e.message); }
    });

    const close = (e) => {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  },

  roleLabel(role) {
    return { owner: 'Owner', admin: 'Admin', moderator: 'Mod', member: '' }[role] || '';
  },

  roleBadgeColor(role) {
    return { owner: '#feb347', admin: '#5865f2', moderator: '#57f287' }[role] || null;
  }
};

window.moderation = moderation;
