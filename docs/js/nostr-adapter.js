(function () {
  async function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    const mount = sdk && sdk.C && sdk.C.mountCommunityApp;
    if (!sdk || !effect || !mount || !window.stateSignals) { setTimeout(init, 30); return; }

    await window.__wireweaveReady;

    const root = document.getElementById('app');
    if (!root) return;

    const [signals, callMod, themeMod, frame, rail, chat, dm, members, voice, settings, overlays, session, account, modules] = await Promise.all([
      import('./adapter/signals.js'),
      import('./adapter/call.js'),
      import('./adapter/theme.js'),
      import('./adapter/frame.js'),
      import('./adapter/rail.js'),
      import('./adapter/chat.js'),
      import('./adapter/dm.js'),
      import('./adapter/members.js'),
      import('./adapter/voice.js'),
      import('./adapter/settings.js'),
      import('./adapter/overlays.js'),
      import('./adapter/session.js'),
      import('./adapter/account.js'),
      import('./modules/registry.js'),
    ]);

    const S = window.stateSignals;
    const { v, persistBool } = signals.createReaders(S);
    const applyTheme = themeMod.makeApplyTheme(sdk, S);
    applyTheme(v('themePref', 'ink'));

    document.addEventListener('zellous:prefs-synced', () => {
      S.themePref.value = localStorage.getItem('zellous-theme') === 'light' ? 'light' : (localStorage.getItem('zellous-g3-theme') || 'ink');
      applyTheme(S.themePref.value);
      for (const [k, sig] of Object.entries({ 'zellous-pref-kw': 'pref_kw', 'zellous-pref-banner': 'pref_banner' })) if (S[sig]) S[sig].value = localStorage.getItem(k) || '';
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const m = /^zellous-pref-(.+)$/.exec(k || ''); if (m && S['pref_' + m[1]] && typeof S['pref_' + m[1]].value === 'boolean') S['pref_' + m[1]].value = localStorage.getItem(k) === '1'; }
    });

    const deps = { v, S, call: callMod.call, applyTheme, persistBool };
    const builders = [
      rail.buildRail(deps),
      chat.buildChat(deps),
      dm.buildDmHome(deps),
      members.buildMembers(deps),
      voice.buildVoice(deps),
      settings.buildSettings(deps),
      overlays.buildOverlays(deps),
      session.buildSession(deps),
      account.buildAccount(deps),
      ...modules.moduleBuilders(deps),
    ];

    const get = () => {
      const f = frame.deriveFrame(v);
      return Object.assign({}, ...builders.map((b) => b.snapshot(f)));
    };
    const actions = Object.assign({}, ...builders.map((b) => b.actions));
    const adapter = { get, subscribe: signals.makeSubscribe(S, effect, modules.moduleSignalList), actions, helpers: frame.helpers, brandName: 'zellous' };

    const app = mount(root, adapter);

    if (app && app.api) {
      window.__zellous.overlays = app.api;
    }
  }
  init().catch((e) => {
    window.__boot?.fail?.('Could not start the chat surface: ' + (e?.message || e));
    throw e;
  });
})();
