const uiMembers = {
  render() {
    if (!ui.onlineMembers) return;
    const members = state.roomMembers || [];
    const roleOrder = ['owner','admin','moderator','member'];
    const roleLabel = { owner:'Owner', admin:'Admin', moderator:'Moderator', member:'Members' };
    const roleColor = { owner:'#f0b232', admin:'#fe7168', moderator:'#57f287' };

    const renderMember = (m) => {
      const color = roleColor[m.role] || null;
      const badgeLabel = (window.moderation && m.role && m.role !== 'member') ? (roleLabel[m.role] || m.role) : '';
      const badge = badgeLabel ? `<span class="member-role-badge" style="color:${color||'var(--text-muted)'}">${badgeLabel}</span>` : '';
      const speaking = (state.activeSpeakers||new Set()).has(m.id) ? ' speaking' : '';
      return `<div class="member-item${speaking}" data-member-id="${m.id}" data-member-name="${escHtml(m.username)}">
        <div class="member-avatar" style="background:${getAvatarColor(m.id)}">
          ${getInitial(m.username)}
          <div class="member-status ${m.online !== false ? 'online' : 'offline'}"></div>
        </div>
        <span class="member-name" style="${color ? 'color:'+color : ''}">${escHtml(m.username)}</span>${badge}
      </div>`;
    };

    const online = members.filter(m => m.online !== false);
    const offline = members.filter(m => m.online === false);
    const byRole = {};
    online.forEach(m => { const r = m.role||'member'; (byRole[r] = byRole[r]||[]).push(m); });

    let html = '';
    if (ui.onlineHeader) ui.onlineHeader.style.display = 'none';

    roleOrder.forEach(role => {
      if (!byRole[role]?.length) return;
      html += `<div class="member-role-header">${roleLabel[role]||role} — ${byRole[role].length}</div>`;
      html += byRole[role].map(renderMember).join('');
    });

    const nonStd = online.filter(m => !roleOrder.includes(m.role||'member'));
    if (nonStd.length) {
      html += `<div class="member-role-header">Members — ${nonStd.length}</div>`;
      html += nonStd.map(renderMember).join('');
    }

    if (!html && online.length) {
      html = `<div class="member-role-header">Online — ${online.length}</div>` + online.map(renderMember).join('');
    }

    if (offline.length) {
      html += '<div class="member-section-separator"></div>';
      html += `<div class="member-role-header">Offline — ${offline.length}</div>`;
      html += offline.map(renderMember).join('');
    }

    ui.onlineMembers.innerHTML = html;
    ui.onlineMembers.querySelectorAll('.member-item').forEach(el => {
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (window.moderation && el.dataset.memberId !== String(state.userId)) {
          moderation.showMemberMenu(el.dataset.memberId, el.dataset.memberName, e.clientX, e.clientY);
        }
      });
    });
  }
};

const uiVoice = {
  renderGrid() {
    if (!ui.voiceGrid) return;
    const participants = state.voiceParticipants || [];
    const ch = state.currentChannel;
    if (!state.voiceConnected && !participants.length) {
      const isConnecting = state.voiceConnectionState === 'connecting';
      ui.voiceGrid.innerHTML = `<div class="empty-state" style="flex-direction:column;gap:12px">
        ${window.getIcon ? getIcon('voiceAlt') : '<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>'}
        <div style="font-size:20px;font-weight:700;color:var(--header-primary)">${ch ? escHtml(ch.name) : 'Voice'}</div>
        ${isConnecting ? '<div style="font-size:14px;color:var(--text-muted)">Connecting…</div>' : ''}
      </div>`;
      ui.voiceGrid.onclick = null;
      return;
    }
    const qDot = (q) => q && q !== 'unknown' ? `<span class="quality-dot ${q}" title="${q}"></span>` : '';
    ui.voiceGrid.innerHTML = participants.map(p => {
      const spk = (state.activeSpeakers||new Set()).has(p.identity) || p.isSpeaking ? ' speaking' : '';
      return `<div class="voice-tile">
        <div class="voice-tile-avatar${spk}" style="background:${getAvatarColor(p.identity)}">${getInitial(p.identity)}</div>
        <div class="voice-tile-name">${escHtml(p.identity)}${qDot(p.connectionQuality)}</div>
        ${p.isMuted ? '<div class="voice-tile-muted"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg></div>' : ''}
      </div>`;
    }).join('');
  },

  renderQueue() {
    if (!ui.audioQueueView) return;
    const activeSegs = Array.from(stateSignals.activeSegments.value.values());
    const queued = stateSignals.audioQueue.value;
    const all = [...activeSegs, ...queued];
    if (!all.length) { ui.audioQueueView.innerHTML = '<div class="empty-state">Queue empty</div>'; return; }
    const speakers = stateSignals.activeSpeakers.value;
    let html = speakers.size > 0 && !state.skipLiveAudio
      ? '<button class="skip-btn" id="skipLiveBtn">Skip Live</button>'
      : (state.skipLiveAudio && speakers.size > 0 ? '<button class="skip-btn resume" id="resumeLiveBtn">Resume Live</button>' : '');
    all.forEach(s => {
      const replaying = state.replayingSegmentId === s.id;
      const icon = replaying
        ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>'
        : { recording:'<svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>', queued:'<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>', playing:'<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>', played:'<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>' }[s.status] || '•';
      const clickable = s.chunks.length > 0 && s.status !== 'recording';
      html += `<div class="queue-item ${s.status}${replaying ? ' replaying' : ''}">
        <span class="queue-icon">${icon}</span>
        <div class="queue-info">
          <div class="queue-name">${escHtml(s.username)}${s.isOwnAudio ? ' (You)' : ''}${s.videoChunks?.length ? ' <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align:-1px"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>' : ''}</div>
          <div class="queue-meta">${s.timestamp.toLocaleTimeString()} · ${s.chunks.length} chunks</div>
        </div>
        ${clickable ? `<div class="queue-actions">
          <button class="queue-btn" data-play="${s.id}"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
          <button class="queue-btn" data-dl="${s.id}"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z"/></svg></button>
        </div>` : ''}
      </div>`;
    });
    ui.audioQueueView.innerHTML = html;
    ui.audioQueueView.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); queue.replaySegment(parseInt(b.dataset.play), true); }));
    ui.audioQueueView.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); queue.downloadSegment(parseInt(b.dataset.dl)); }));
    document.getElementById('skipLiveBtn')?.addEventListener('click', () => audio.skipLive());
    document.getElementById('resumeLiveBtn')?.addEventListener('click', () => audio.resumeLive());
  },

  renderTurnOrder() {},

  renderPanel() {
    if (!ui.voicePanel) return;
    ui.voicePanel.classList.toggle('visible', !!state.voiceConnected);
    if (!state.voiceConnected) return;
    const header = ui.voicePanel.querySelector('.voice-panel-header');
    if (!header) return;
    const qc = { excellent:'var(--status-positive)', good:'var(--status-positive)', poor:'var(--status-warning)', lost:'var(--status-danger)' }[state.voiceConnectionQuality] || 'var(--status-positive)';
    if (state.voiceConnectionState === 'reconnecting') header.innerHTML = '<span style="color:var(--status-warning)">●</span> Reconnecting…';
    else if (state.voiceConnectionState === 'connected') header.innerHTML = `<span style="color:${qc}">●</span> Voice Connected`;
    else header.innerHTML = '<span style="color:var(--status-danger)">●</span> Disconnected';
    const chName = ui.voicePanel.querySelector('.voice-panel-channel');
    if (chName) chName.textContent = state.voiceChannelName || '';
  }
};

window.uiMembers = uiMembers;
window.uiVoice = uiVoice;
