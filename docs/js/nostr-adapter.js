// nostr-adapter — the thin consumer seam. Maps zellous's Nostr-backed state
// (window.stateSignals preact signals) + action modules to the design-system
// adapter contract, then hands the whole GUI to the SDK's mountCommunityApp.
// All composition/rendering lives in the SDK (window.__sdk.C.mountCommunityApp);
// zellous only supplies data + action callbacks. Each surface's fields and
// actions come from its builder in ./adapter/ (one module per surface).
(function () {
  async function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    const mount = sdk && sdk.C && sdk.C.mountCommunityApp;
    if (!sdk || !effect || !mount || !window.stateSignals) { setTimeout(init, 30); return; }

    const root = document.getElementById('app');
    if (!root) return;

    const [signals, callMod, themeMod, frame, rail, chat, dm, members, voice, settings, overlays, session] = await Promise.all([
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
    ]);

    const S = window.stateSignals;
    const { v, persistBool } = signals.createReaders(S);
    const applyTheme = themeMod.makeApplyTheme(sdk, S);
    applyTheme(v('themePref', 'ink'));

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
    ];

    // Snapshot read across the live signals. effect() (inside subscribe) tracks
    // whichever .value reads happen during render, so any change re-renders.
    const get = () => {
      const f = frame.deriveFrame(v);
      return Object.assign({}, ...builders.map((b) => b.snapshot(f)));
    };
    const actions = Object.assign({}, ...builders.map((b) => b.actions));
    const adapter = { get, subscribe: signals.makeSubscribe(S, effect), actions, helpers: frame.helpers, brandName: 'zellous' };

    const app = mount(root, adapter);

    // Preserve the imperative overlay globals other zellous modules call.
    if (app && app.api) {
      window.__contextMenu = app.api.contextMenu;
      window.__emojiPicker = app.api.emojiPicker;
      window.__commandPalette = app.api.commandPalette;
    }
    window.__communityAppMounted = true;
  }
  init().catch((e) => {
    window.__boot?.fail?.('Could not start the chat surface: ' + (e?.message || e));
    throw e;
  });
})();
