const rel = (ms) => (ms === null || ms === undefined ? '' : Math.round(ms) + ' ms');

export function buildAccount({ v, S, call }) {
  const core = () => (window.nostrAccount && window.nostrAccount.core) || null;
  const me = () => (window.state && window.state.nostrPubkey) || '';
  const sid = () => v('currentServerId', null);
  const serverName = () => { const s = (v('servers', []) || []).find((x) => x && x.id === sid()); return s ? s.name : ''; };
  let rotated = null;
  let signerFlow = null;
  const memberKeys = () => peopleKeys().filter((k) => k !== me());
  const bumpFlow = () => { if (S.accountVersion) S.accountVersion.value += 1; };
  const qrSvg = (text) => { const q = window.QrCode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); };

  const bannerCss = (b, name) => {
    if (!b || b.mode === 'auto') return '';
    if (b.mode === 'colour') return b.a;
    if (b.mode === 'gradient') return 'linear-gradient(' + (b.angle || 135) + 'deg,' + b.a + ',' + b.b + ')';
    if (b.mode === 'image') return 'url("' + String(b.url).replace(/["\\\n\r()]/g, encodeURIComponent) + '") center/cover no-repeat';
    return '';
  };

  const peopleKeys = () => {
    const set = new Set();
    const self = me(); if (self) set.add(self);
    for (const m of (v('chatMessages', []) || [])) if (m && m.userId) set.add(m.userId);
    for (const cat of ((window.__zellous.uiMembers && window.__zellous.uiMembers.categories && window.__zellous.uiMembers.categories()) || [])) for (const m of (cat.members || [])) if (m.identity) set.add(m.identity);
    for (const m of (v('dmMessages', []) || [])) if (m && m.peer) set.add(m.peer);
    const linked = v('profileLink', ''); if (linked) set.add(linked);
    return [...set];
  };

  const metaFor = (c, pk) => {
    const p = c.profileOf(pk) || {};
    return {
      pronouns: p.pronouns || '', about: p.about || '', location: p.location || '', website: p.website || '', username: p.username || '',
      links: Array.isArray(p.links) ? p.links : [], banner: bannerCss(p.zbanner), accent: p.accent || '', birthday: p.birthday || '',
      nip05: p.nip05 || '', moved: p.moved_to || ''
    };
  };

  const nsecOf = () => (window.auth && window.auth.nsecEncode && window.auth.nsecEncode()) || null;

  const snapshot = () => {
    v('accountVersion', 0); v('profilesVersion', 0); v('mutesVersion', 0); v('presenceVersion', 0);
    const c = core();
    const pk = me();
    if (!c || !pk) return { account: { signedIn: false }, avatars: {}, profileMeta: {} };
    const keys = peopleKeys();
    const avatars = {}; const profileMeta = {}; const accountNames = {};
    for (const k of keys) { const a = c.avatarOf(k, sid()); if (a) avatars[k] = a; const an = c.accountNameOf(k); if (an && c.nickFor(k, sid()) && c.nickFor(k, sid()) !== an) accountNames[k] = an; const m = metaFor(c, k); if (m.pronouns || m.about || m.location || m.website || m.links.length || m.banner || m.accent || m.birthday || m.nip05 || m.moved) profileMeta[k] = m; }
    const pub = c.publicProfile();
    const st = window.nostrPresence ? window.nostrPresence.statusOf(pk) : { status: 'online' };
    const server = sid() ? { id: sid(), name: serverName(), ...(c.priv.perServer[sid()] || { nick: '', avatar: '' }) } : null;
    return {
      avatars, profileMeta, accountNames,
      account: {
        signedIn: true, pubkey: pk, npub: c.auth.npubEncode(pk),
        hasPrivkey: !!(window.auth && window.auth.nsecEncode && window.auth.nsecEncode()),
        extensionAvailable: !!window.nostr, signsWithExtension: !(window.auth && window.auth.nsecEncode && window.auth.nsecEncode()),
        pub: { name: pub.name || '', username: pub.username || '', about: pub.about || '', pronouns: pub.pronouns || '', location: pub.location || '', website: pub.website || '', picture: pub.picture || '', accent: pub.accent || '', links: pub.links || [], banner: pub.zbanner || { mode: 'auto' }, nip05: pub.nip05 || '' },
        nip05: c.priv.nip05,
        status: { status: c.wantedStatus(), text: c.priv.customStatus.text, emoji: c.priv.customStatus.emoji, expiresAt: c.priv.customStatus.expiresAt, shown: st.status },
        privacy: c.priv.privacy, birthday: c.priv.birthday,
        server,
        relays: c.relays().map((r) => ({ ...r, latency: rel(r.latencyMs) })),
        defaultRelays: c.defaultRelays(),
        blocked: c.blocked().map((b) => ({ pubkey: b, name: window.chat ? window.chat.resolveProfile(b) : b.slice(0, 8) })),
        sync: { at: c.privAt, canEncrypt: !!(c.auth.privkey || (c.auth.getExtension() && c.auth.getExtension().nip44)) },
        note: v('accountNote', null),
        identities: c.identities(),
        setup: (() => { v('setupVersion', 0); const st = window.nostrSetup ? window.nostrSetup.get() : {}; return { open: !!v('setupOpen', false), focus: v('setupFocus', ''), dismissed: !!st.dismissed, backedUp: !!st.backedUp }; })(),
        profileLink: (() => { const pk = v('profileLink', ''); return pk ? { identity: pk, name: window.chat ? window.chat.resolveProfile(pk) : pk.slice(0, 8), status: 'online', ...metaFor(c, pk), accountName: '' } : null; })(),
        rotated,
        signer: { remote: c.auth.getExtension() && window.nostrRemote ? window.nostrRemote.describe() : null, flow: signerFlow, supported: !!window.nostrRemote },
        bannerCss: bannerCss(pub.zbanner),
        meta: metaFor(c, pk)
      }
    };
  };

  const run = (key, fn, ok) => { const a = window.nostrAccount; return a ? a.run(key, fn, ok) : undefined; };
  const reload = () => setTimeout(() => location.reload(), 400);
  const download = (name, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const readFile = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('Could not read that file')); r.readAsText(file); });

  return {
    snapshot,
    actions: {
      accountSavePublic: (key, fields, okText) => call(() => run(key, () => core().setPublic(fields), okText || 'Saved')),
      accountUploadAvatar: (file) => call(() => run('avatar', async () => core().setPublic({ picture: await window.nostrAccount.resizeImageFile(file, { size: 192 }) }), 'Picture updated')),
      accountGenerateAvatar: () => call(() => run('avatar', () => core().setPublic({ picture: window.nostrAccount.generateAvatar(me() + ':' + Date.now()) }), 'New picture generated')),
      accountClearAvatar: () => call(() => run('avatar', () => core().setPublic({ picture: '' }), 'Picture removed')),
      accountUploadBanner: (file) => call(() => run('banner', async () => core().setPublic({ banner: { mode: 'image', url: await window.nostrAccount.resizeImageFile(file, { size: 640, maxChars: 52000, cover: false }) } }), 'Banner updated')),
      accountVerifyNip05: (id) => call(() => run('nip05', async () => { await core().setPublic({ nip05: id }); if (!String(id || '').trim()) { await core().setPrivate({ nip05: { id: '', ok: false, at: 0, reason: '' } }); return { ok: true, cleared: true }; } return core().verifyNip05(id); }, (r) => (r && r.cleared ? 'NIP-05 removed' : r && r.ok ? 'Verified: ' + r.id : 'Saved, but not verified: ' + (r && r.reason)))),
      accountSetStatus: (p) => call(() => run('status', () => core().setStatus(p), 'Status updated')),
      accountSetPrivacy: (patch) => call(() => run('privacy', () => core().setPrivate({ privacy: patch }), 'Privacy saved').then(() => { core()._applyPresence(); if (window.dm) window.dm.maybeSendReceipt(); })),
      accountSetBirthday: (p) => call(() => run('birthday', () => core().setBirthday(p), 'Birthday saved')),
      accountCheckNick: (text) => (core() ? core().checkNick(sid(), text, memberKeys()) : []),
      accountSetServerProfile: (p) => call(() => run('server', async () => { const r = await core().setServerProfile(sid(), p); const clash = r.nick ? core().checkNick(sid(), r.nick, memberKeys()) : []; if (clash.length) throw new Error('Saved, but "' + r.nick + '" ' + (clash[0].kind === 'exact' ? 'is the same as' : 'looks a lot like') + ' ' + clash[0].name + (clash.length > 1 ? ' and ' + (clash.length - 1) + ' more' : '') + ' in this server. People may mistake you for them, and everyone can hover your name to see your real account name.'); return r; }, 'Saved for ' + (serverName() || 'this server'))),
      accountUploadServerAvatar: (file) => call(() => run('server', async () => { const cur = (core().priv.perServer[sid()] || {}); return core().setServerProfile(sid(), { nick: cur.nick || '', avatar: await window.nostrAccount.resizeImageFile(file, { size: 160, maxChars: 30000 }) }); }, 'Server picture saved')),
      accountAddRelay: (url) => call(() => run('relays', () => core().addRelay(url), (r) => 'Added ' + r.url + (r.published ? '' : ' (not yet confirmed by a relay)'))),
      accountRemoveRelay: (url) => call(() => run('relays', () => core().removeRelay(url), 'Removed')),
      accountResetRelays: () => call(() => run('relays', () => core().resetRelays(), 'Relays reset to defaults')),
      accountReconnectRelay: (url) => call(() => run('relays', async () => core().pool.reconnectRelay(url), 'Reconnecting')),
      accountBlock: (input) => call(() => run('blocked', () => core().block(input), 'Blocked')),
      accountUnblock: (pk) => call(() => run('blocked', () => core().unblock(pk), 'Unblocked')),
      accountExport: () => call(() => run('data', async () => { const t = core().exportJson(); download('zellous-account-' + new Date().toISOString().slice(0, 10) + '.json', t); return t.length; }, 'Exported')),
      accountImport: (file) => call(() => run('data', async () => core().importJson(await readFile(file)), (r) => 'Imported ' + r.fields + ' profile fields and ' + r.relays + ' relays')),
      accountDeleteLocal: () => call(() => run('data', async () => { await window.dm.reset(); localStorage.clear(); try { sessionStorage.clear(); } catch {} reload(); return true; }, 'Local data deleted. Reloading')),
      accountRequestDeletion: (reason) => call(() => run('data', () => core().requestDeletion({ reason }), (r) => r.requested ? 'Deletion requested for ' + r.requested + ' items in ' + r.batches + ' request(s). Relays decide whether to honour it.' : 'No published events were found to delete')),
      accountPushSync: () => call(() => run('sync', () => core().pushSync(), (r) => r.ok ? 'Synced to your relays' : 'Saved locally; no relay confirmed yet')),
      accountPullSync: () => call(() => run('sync', () => core().pullSync(), (r) => r.found ? 'Pulled settings from your relays' : 'No synced settings found for this key yet')),
      accountNsec: () => nsecOf(),
      accountImportKey: (input) => call(() => run('key', async () => { if (!window.auth.importKey(input)) throw new Error('That is not a valid nsec or 64-character hex key'); window.auth._afterLogin(); reload(); return true; }, 'Key imported. Reloading')),
      accountRotateKey: () => call(() => run('key', async () => { const r = await core().rotateKey(); rotated = { oldNsec: r.oldNsec, oldNpub: r.oldNpub, newNpub: r.newNpub }; window.state.authVersion = (window.state.authVersion || 0) + 1; return r; }, 'Rotated. Save your old key below, then reload')),
      accountDismissRotation: () => call(() => { rotated = null; reload(); }),
      accountConnectBunker: (input) => call(() => run('signer', async () => { signerFlow = { mode: 'bunker', status: 'connecting' }; bumpFlow(); try { await window.nostrRemote.connectBunker(input); } catch (e) { signerFlow = null; bumpFlow(); throw e; } reload(); return true; }, 'Connected. Reloading')),
      accountStartQr: () => call(() => { const relays = core().pool.relayList().slice(0, 2); let flow; try { flow = window.nostrRemote.startQr({ relays, name: 'Zellous', url: location.origin + location.pathname }); } catch (e) { return run('signer', async () => { throw e; }); } signerFlow = { mode: 'qr', status: 'waiting', uri: flow.uri, svg: qrSvg(flow.uri) }; bumpFlow(); return run('signer', async () => { try { await flow.promise; } catch (e) { signerFlow = null; bumpFlow(); if (e.message === 'cancelled') return false; throw e; } reload(); return true; }, 'Connected. Reloading'); }),
      accountCancelQr: () => call(() => { window.nostrRemote.cancelQr(); signerFlow = null; bumpFlow(); }),
      accountDisconnectSigner: () => call(() => window.ui.confirm({ title: 'Disconnect the remote signer?', message: 'This browser forgets the signer and signs out. Your key stays with the signer app.', confirmLabel: 'Disconnect', danger: true }).then((yes) => { if (yes) { window.auth.logout(); reload(); } })),
      accountExtensionLogin: () => call(() => run('key', async () => { if (!window.nostr) throw new Error('No Nostr browser extension found'); await window.auth.loginWithExtension(); window.auth._afterLogin(); return true; }, 'Signed in with your extension')),
      accountCopyText: (text, note) => call(() => navigator.clipboard.writeText(String(text)).then(() => window.nostrAccount.note('copy', true, note || 'Copied'), () => window.nostrAccount.note('copy', false, 'Copy failed'))),
      accountProfileLink: () => (core() ? location.origin + location.pathname + '?profile=' + core().auth.npubEncode(me()) : ''),
      accountRename: (name) => call(() => run('rename', () => core().setPublic({ name }), 'Name saved')),
      accountSwitchIdentity: (pk) => call(() => run('identity', async () => { core().switchTo(pk); reload(); return true; }, 'Switching identity. Reloading')),
      accountForgetIdentity: (pk) => call(() => run('identity', async () => { core().forgetIdentity(pk); return true; }, 'Forgot that identity')),
      accountImportNew: (input) => call(() => run('identity', async () => { core().importAsNew(input); reload(); return true; }, 'Key imported. Reloading')),
      accountNewThrowaway: () => call(() => run('identity', async () => { core().newThrowaway(); reload(); return true; }, 'New identity created. Reloading')),
      setupOpen: (focus) => call(() => window.nostrSetup && window.nostrSetup.open(focus)),
      setupClose: () => call(() => { if (S.setupOpen) S.setupOpen.value = false; }),
      setupDismissForever: () => call(() => { window.nostrSetup.set({ dismissed: true }); if (S.setupOpen) S.setupOpen.value = false; }),
      setupMarkBackedUp: () => call(() => window.nostrSetup.set({ backedUp: true })),
      clearProfileLink: () => call(() => { if (S.profileLink) S.profileLink.value = ''; }),
      accountSignOut: () => call(() => window.ui.confirm({ title: 'Sign out?', message: 'This removes your key from this browser. If you have not backed it up, you cannot get this identity back.', confirmLabel: 'Sign out', danger: true }).then((yes) => { if (yes) { window.auth.logout(); reload(); } })),
    },
  };
}
