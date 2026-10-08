// The SDK bundle owns its own theme system (its own localStorage key
// '247420:theme', vocabulary auto/paper/ink/thebird) and self-applies it
// via a microtask right after the module evaluates. Route through sdk.applyTheme
// so we win the last write instead of fighting it with a second, incompatible
// attribute value.
export function makeApplyTheme(sdk, S) {
  return (next) => {
    const theme = next === 'light' ? 'light' : 'ink';
    if (S.themePref) S.themePref.value = theme;
    // The SDK's own colors_and_type.css only defines [data-theme="paper"/"ink"/"auto"/"thebird"]
    // blocks -- zellous's own 'light'/'ink' vocabulary matches no CSS rule at
    // all if ever written directly, so even the fallback path must translate.
    if (sdk.applyTheme) sdk.applyTheme(theme === 'light' ? 'paper' : 'ink');
    else document.documentElement.setAttribute('data-theme', theme === 'light' ? 'paper' : 'ink');
    try { localStorage.setItem('zellous-theme', theme); } catch (_) {}
  };
}
