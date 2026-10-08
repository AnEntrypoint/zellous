// Auth modal state and actions. The other overlays (context menu, emoji
// picker, command palette) are imperative globals re-exposed by nostr-adapter.js.
export function buildOverlays({ v, S, call }) {
  return {
    snapshot: () => ({
      showAuthModal: v('showAuthModal', false),
      authMode: v('authMode', 'extension'),
      authError: v('authError', ''),
      authBusy: v('authBusy', false),
    }),
    actions: {
      setAuthMode: (m) => call(() => { if (S.authMode) S.authMode.value = m; if (S.authError) S.authError.value = ''; }),
      closeAuth: () => call(() => { if (S.showAuthModal) S.showAuthModal.value = false; if (S.authError) S.authError.value = ''; if (S.authBusy) S.authBusy.value = false; }),
      authExtension: () => call(async () => {
        if (!window.auth) return;
        if (S.authBusy) S.authBusy.value = true;
        try {
          if (!window.nostr) throw new Error('No Nostr extension found');
          await window.auth.loginWithExtension();
          if (S.showAuthModal) S.showAuthModal.value = false;
          if (S.authError) S.authError.value = '';
        } catch (e) {
          if (S.authError) S.authError.value = (e && e.message) || 'Extension login failed';
        } finally {
          if (S.authBusy) S.authBusy.value = false;
        }
      }),
      authGenerate: () => call(async () => {
        if (!window.__zellous || !window.__zellous.generateKeyWithConfirm) return;
        try {
          const done = await window.__zellous.generateKeyWithConfirm();
          if (!done) return;
          if (S.showAuthModal) S.showAuthModal.value = false;
          if (S.authError) S.authError.value = '';
        } catch (e) {
          if (S.authError) S.authError.value = (e && e.message) || 'Failed to generate key';
        }
      }),
      authImport: (key) => call(() => {
        if (!window.auth) return;
        const k = (key || '').trim();
        if (!k) { if (S.authError) S.authError.value = 'Enter a key'; return; }
        const ok = window.auth.importKey(k);
        if (ok) {
          if (S.showAuthModal) S.showAuthModal.value = false;
          if (S.authError) S.authError.value = '';
        } else if (S.authError) {
          S.authError.value = 'Invalid key — expected nsec1… or a 64-character hex secret key';
        }
      }),
    },
  };
}
