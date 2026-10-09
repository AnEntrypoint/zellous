export function makeApplyTheme(sdk, S) {
  return (next) => {
    const theme = next === 'light' ? 'light' : 'ink';
    if (S.themePref) S.themePref.value = theme;
    if (sdk.applyTheme) sdk.applyTheme(theme === 'light' ? 'paper' : 'ink');
    else document.documentElement.setAttribute('data-theme', theme === 'light' ? 'paper' : 'ink');
    try { localStorage.setItem('zellous-theme', theme); } catch (_) {}
  };
}
