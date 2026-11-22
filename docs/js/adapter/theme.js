const VARIANTS = ['ash', 'onyx'];

export function makeApplyTheme(sdk, S) {
  return (next) => {
    const variant = VARIANTS.includes(next) ? next : null;
    const theme = next === 'light' ? 'light' : 'ink';
    if (S.themePref) S.themePref.value = variant || theme;
    if (sdk.applyTheme) sdk.applyTheme(theme === 'light' ? 'paper' : 'ink');
    else document.documentElement.setAttribute('data-theme', theme === 'light' ? 'paper' : 'ink');
    document.documentElement.setAttribute('data-g3-theme', variant || (theme === 'light' ? 'light' : 'dark'));
    try {
      localStorage.setItem('zellous-theme', theme);
      if (variant) localStorage.setItem('zellous-g3-theme', variant); else localStorage.removeItem('zellous-g3-theme');
    } catch (_) {}
  };
}
