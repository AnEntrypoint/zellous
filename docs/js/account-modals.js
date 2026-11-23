channelManager.showSettingsModal = function(channelId) {
  var ch = (state.channels || []).find(function(c) { return c.id === channelId; });
  if (!ch) return;
  document.getElementById('channelSettingsModal')?.remove();

  var isOwner = window.serverRoles && state.currentServerId &&
    (serverRoles.isOwner(state.currentServerId) || serverRoles.isAdmin(state.currentServerId));
  var typeLabel = escHtml(window.zModules.typeLabel(ch.type));
  var modeNow = ch.voiceMode || 'ptt';
  var topicNow = ch.topic || '';

  var voiceSection = '';
  if (window.zModules.trait(ch.type, 'voice')) {
    voiceSection =
      '<div class="modal-field"><label class="modal-label">Channel Mode</label>' +
        '<div style="display:flex;gap:8px">' +
          '<label style="flex:1;display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:6px;cursor:' + (isOwner ? 'pointer' : 'not-allowed') + ';background:' + (modeNow === 'ptt' ? 'var(--bg-4)' : 'var(--bg-3)') + ';opacity:' + (isOwner ? '1' : '0.7') + '">' +
            '<input type="radio" name="csMode" value="ptt"' + (modeNow === 'ptt' ? ' checked' : '') + (isOwner ? '' : ' disabled') + ' style="accent-color:var(--accent)">' +
            '<span><strong style="color:var(--fg)">Push-to-talk</strong><br><span style="font-size:11px;color:var(--fg-3)">Hold to speak. Anti-overtalk queues you if someone else is talking.</span></span>' +
          '</label>' +
          '<label style="flex:1;display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:6px;cursor:' + (isOwner ? 'pointer' : 'not-allowed') + ';background:' + (modeNow === 'realtime' ? 'var(--bg-4)' : 'var(--bg-3)') + ';opacity:' + (isOwner ? '1' : '0.7') + '">' +
            '<input type="radio" name="csMode" value="realtime"' + (modeNow === 'realtime' ? ' checked' : '') + (isOwner ? '' : ' disabled') + ' style="accent-color:var(--accent)">' +
            '<span><strong style="color:var(--fg)">Realtime</strong><br><span style="font-size:11px;color:var(--fg-3)">Mic always open. Toggle with the mic button.</span></span>' +
          '</label>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--fg-3);margin-top:6px">Applies to every participant in this channel.' + (isOwner ? '' : ' Only the server owner can change this.') + '</div>' +
      '</div>';
  }

  var modal = document.createElement('div');
  modal.id = 'channelSettingsModal';
  modal.className = 'modal-overlay open';
  modal.innerHTML =
    '<div class="modal-box" style="max-width:460px">' +
      '<div class="modal-title">' + typeLabel + ' Channel Settings</div>' +
      '<div class="modal-subtitle">#' + escHtml(ch.name || '') + '</div>' +
      '<div class="modal-field"><label class="modal-label">Name</label>' +
        '<input type="text" class="modal-input" id="csName" value="' + escHtml(ch.name || '') + '" maxlength="40"' + (isOwner ? '' : ' disabled') + '></div>' +
      '<div class="modal-field"><label class="modal-label">Topic</label>' +
        '<input type="text" class="modal-input" id="csTopic" value="' + escHtml(topicNow) + '" maxlength="200" placeholder="What is this channel about?"' + (isOwner ? '' : ' disabled') + '></div>' +
      voiceSection +
      (isOwner
        ? '<div class="modal-actions"><button type="button" class="modal-btn secondary" id="csCancel">Cancel</button><button type="button" class="modal-btn" id="csSave">Save</button></div>'
        : '<button type="button" class="modal-btn secondary" id="csCancel">Close</button>') +
    '</div>';
  document.body.appendChild(modal);
  _a11yModal(modal);

  if (isOwner) {
    modal.querySelector('#csSave').addEventListener('click', async function() {
      var patch = {};
      var newName = (modal.querySelector('#csName').value || '').trim();
      var newTopic = (modal.querySelector('#csTopic').value || '').trim();
      if (newName && newName !== ch.name) patch.name = newName;
      if (newTopic !== topicNow) patch.topic = newTopic;
      if (window.zModules.trait(ch.type, 'voice')) {
        var modeEl = modal.querySelector('input[name="csMode"]:checked');
        if (modeEl && modeEl.value !== modeNow) patch.voiceMode = modeEl.value;
      }
      if (!Object.keys(patch).length) { modal.remove(); return; }
      try {
        await channelManager.update(channelId, patch);
        if (window.ui?.showToast) ui.showToast('Channel settings saved');
        modal.remove();
      } catch (e) {
        if (window.ui?.showToast) ui.showToast('Failed to save channel settings: ' + (e && e.message || 'unknown error'), 'error');
        console.warn('[Channel] update failed:', e && e.message);
      }
    });
  }
  modal.querySelector('#csCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

channelManager.showProfileModal = function() {
  document.getElementById('profileModal')?.remove();
  var resolved = (window.chat && window.chat.resolveProfile(window.state.nostrPubkey)) || '';
  var cur = /^npub1/.test(resolved) ? '' : resolved;
  var modal = document.createElement('div');
  modal.id = 'profileModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box"><div class="modal-title">Display name</div>' +
    '<div class="modal-subtitle">Shown to everyone instead of your key. Published to relays.</div>' +
    '<form id="profileForm" onsubmit="return false">' +
    '<div class="modal-field"><label class="modal-label" for="profileName">Name</label>' +
    '<input type="text" class="modal-input" id="profileName" maxlength="40" autocomplete="off" value="' + escHtml(cur) + '" autofocus></div>' +
    '<div class="modal-actions"><button type="button" class="modal-btn secondary" id="profileCancel">Cancel</button><button type="submit" class="modal-btn" id="profileSave">Save</button></div>' +
    '</form></div>';
  document.body.appendChild(modal);
  _a11yModal(modal);
  var input = modal.querySelector('#profileName');
  modal.querySelector('#profileCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  modal.querySelector('#profileForm').addEventListener('submit', async function() {
    var name = input.value.trim();
    if (!name) { _invalidInput(input); return; }
    try { await window.auth.setDisplayName(name.slice(0, 40)); modal.remove(); window.ui && window.ui.showToast && window.ui.showToast('Display name saved', 2500); }
    catch (e) { window.ui && window.ui.showToast && window.ui.showToast('Could not save name: ' + (e && e.message || 'unknown'), 4000, 'error'); }
  });
};

channelManager.showNewDmModal = function() {
  document.getElementById('newDmModal')?.remove();
  var modal = document.createElement('div');
  modal.id = 'newDmModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box"><div class="modal-title">New message</div>' +
    '<div class="modal-subtitle">Messages are end-to-end encrypted between you and them.</div>' +
    '<form id="newDmForm" onsubmit="return false">' +
    '<div class="modal-field"><label class="modal-label" for="newDmPeer">Their public key (npub)</label>' +
    '<input type="text" class="modal-input" id="newDmPeer" placeholder="npub1..." autocomplete="off" spellcheck="false" autofocus>' +
    '<div id="newDmOwnNpub" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--fg-3)"></div></div>' +
    '<div class="modal-actions"><button type="button" class="modal-btn secondary" id="newDmCancel">Cancel</button><button type="submit" class="modal-btn">Start</button></div>' +
    '</form></div>';
  document.body.appendChild(modal);
  _a11yModal(modal);
  var input = modal.querySelector('#newDmPeer');
  var ownNpub = '';
  try { ownNpub = (window.state && window.state.nostrPubkey && window.NostrTools) ? window.NostrTools.nip19.npubEncode(window.state.nostrPubkey) : ''; } catch (e) { ownNpub = ''; }
  var hint = modal.querySelector('#newDmOwnNpub');
  if (hint && ownNpub) {
    var hintText = document.createElement('span');
    hintText.textContent = 'Ask them for theirs — yours is ' + ownNpub.slice(0, 12) + '…';
    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'modal-btn secondary';
    copyBtn.style.cssText = 'padding:2px 8px;min-height:0;font-size:11px';
    copyBtn.textContent = 'click to copy';
    copyBtn.addEventListener('click', function() {
      navigator.clipboard?.writeText(ownNpub).then(function() {
        copyBtn.textContent = 'copied!';
        setTimeout(function() { copyBtn.textContent = 'click to copy'; }, 1600);
      }).catch(function(e) {
        window.ui && window.ui.showToast && window.ui.showToast('Clipboard copy failed: ' + (e && e.message || 'select the key and copy manually'), 4000, 'error');
      });
    });
    hint.append(hintText, copyBtn);
  }
  modal.querySelector('#newDmCancel').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  modal.querySelector('#newDmForm').addEventListener('submit', function() {
    var raw = input.value.trim(), hex = null;
    try {
      if (/^[0-9a-f]{64}$/i.test(raw)) hex = raw.toLowerCase();
      else { var d = window.NostrTools.nip19.decode(raw); if (d.type === 'npub') hex = d.data; else if (d.type === 'nprofile') hex = d.data.pubkey; }
    } catch (e) { hex = null; }
    if (!hex) { _invalidInput(input); window.ui && window.ui.showToast && window.ui.showToast('That is not a valid npub or public key', 3000, 'error'); return; }
    window.stateSignals.activeDmPeer.value = hex;
    modal.remove();
  });
};

channelManager.showKeyBackupModal = function() {
  document.getElementById('keyBackupModal')?.remove();
  var nsec = window.auth && window.auth.nsecEncode && window.auth.nsecEncode();
  if (!nsec) return;
  var modal = document.createElement('div');
  modal.id = 'keyBackupModal'; modal.className = 'modal-overlay open';
  modal.innerHTML = '<div class="modal-box" style="max-width:440px"><div class="modal-title">Back Up Your Key</div>' +
    '<p style="font-size:13px;color:var(--fg-3);margin:0 0 12px 0">This is your private key. Anyone with it can post as you, forever. Store it somewhere safe (a password manager) and never share it.</p>' +
    '<div class="modal-field"><button type="button" class="modal-btn" id="kbReveal">Click to reveal</button>' +
    '<textarea class="modal-input" id="kbNsec" readonly rows="3" style="display:none;font-family:var(--ff-mono,monospace);font-size:12px;word-break:break-all;margin-top:8px"></textarea></div>' +
    '<div class="modal-actions"><button type="button" class="modal-btn secondary" id="kbClose">Done</button><button type="button" class="modal-btn" id="kbCopy" style="display:none">Copy to clipboard</button></div></div>';
  document.body.appendChild(modal);
  _a11yModal(modal);
  var revealBtn = modal.querySelector('#kbReveal'), ta = modal.querySelector('#kbNsec'), copyBtn = modal.querySelector('#kbCopy');
  revealBtn.addEventListener('click', function() {
    ta.value = nsec; ta.style.display = 'block'; copyBtn.style.display = 'inline-block'; revealBtn.style.display = 'none';
  });
  copyBtn.addEventListener('click', function() {
    navigator.clipboard?.writeText(nsec).then(function() {
      copyBtn.textContent = 'Copied!'; setTimeout(function() { copyBtn.textContent = 'Copy to clipboard'; }, 1600);
    }).catch(function(e) {
      window.ui && window.ui.showToast && window.ui.showToast('Clipboard copy failed: ' + (e && e.message || 'select the text and copy manually'), 4000, 'error');
    });
  });
  modal.querySelector('#kbClose').addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};
