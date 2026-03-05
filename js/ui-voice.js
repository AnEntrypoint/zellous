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
      ui.voiceGrid.innerHTML = `<div class="empty-state voice-join-prompt" style="cursor:pointer;flex-direction:column;gap:12px">
        ${window.getIcon ? getIcon('voiceAlt') : '🔊'}
        <div style="font-size:20px;font-weight:700;color:var(--header-primary)">${ch ? escHtml(ch.name) : 'Voice'}</div>
        <div style="font-size:14px">Click to join voice channel</div>
      </div>`;
      ui.voiceGrid.querySelector('.voice-join-prompt')?.addEventListener('click', () => {
        if (!ch || ch.type !== 'voice') return;
        if (window.lk) lk.connect(ch.name, { forceRelay: localStorage.getItem('zellous_forceRelay') === 'true' });
      });
      return;
    }
    const qDot = (q) => q && q !== 'unknown' ? `<span class="quality-dot ${q}" title="${q}"></span>` : '';
    ui.voiceGrid.innerHTML = participants.map(p => {
      const spk = (state.activeSpeakers||new Set()).has(p.identity) || p.isSpeaking ? ' speaking' : '';
      return `<div class="voice-tile">
        <div class="voice-tile-avatar${spk}" style="background:${getAvatarColor(p.identity)}">${getInitial(p.identity)}</div>
        <div class="voice-tile-name">${escHtml(p.identity)}${qDot(p.connectionQuality)}</div>
        ${p.isMuted ? '<div class="voice-tile-muted">🔇</div>' : ''}
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
      const icon = replaying ? '🔊' : { recording:'🔴', queued:'⏸', playing:'▶', played:'✓' }[s.status] || '•';
      const clickable = s.chunks.length > 0 && s.status !== 'recording';
      html += `<div class="queue-item ${s.status}${replaying ? ' replaying' : ''}">
        <span class="queue-icon">${icon}</span>
        <div class="queue-info">
          <div class="queue-name">${escHtml(s.username)}${s.isOwnAudio ? ' (You)' : ''}${s.videoChunks?.length ? ' 📹' : ''}</div>
          <div class="queue-meta">${s.timestamp.toLocaleTimeString()} · ${s.chunks.length} chunks</div>
        </div>
        ${clickable ? `<div class="queue-actions">
          <button class="queue-btn" data-play="${s.id}">▶</button>
          <button class="queue-btn" data-dl="${s.id}">⬇</button>
        </div>` : ''}
      </div>`;
    });
    ui.audioQueueView.innerHTML = html;
    ui.audioQueueView.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); queue.replaySegment(parseInt(b.dataset.play), true); }));
    ui.audioQueueView.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); queue.downloadSegment(parseInt(b.dataset.dl)); }));
    document.getElementById('skipLiveBtn')?.addEventListener('click', () => audio.skipLive());
    document.getElementById('resumeLiveBtn')?.addEventListener('click', () => audio.resumeLive());
  },

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
