const themeManager = {
  themes: {
    light: {'--bg-base': '#f5f5f5', '--bg-surface': '#ffffff', '--text-primary': '#1a1a1a', '--text-secondary': '#666'},
    dark: {'--bg-base': '#0a0e27', '--bg-surface': '#141829', '--text-primary': '#e8eaf0', '--text-secondary': '#9ca3b8'},
    auto: null
  },
  
  accents: {
    indigo: '#6366f1',
    violet: '#8b5cf6',
    pink: '#ec4899',
    cyan: '#06b6d4',
    green: '#22c55e',
    orange: '#f97316'
  },
  
  init() {
    const saved = localStorage.getItem('zn_theme') || 'auto';
    const accent = localStorage.getItem('zn_accent') || 'indigo';
    this.setTheme(saved);
    this.setAccent(accent);
    this._watchSystemTheme();
  },
  
  setTheme(theme) {
    if (theme === 'auto') {
      this._applySystemTheme();
      this._watchSystemTheme();
    } else if (this.themes[theme]) {
      const vars = this.themes[theme];
      Object.entries(vars).forEach(([key, val]) => {
        document.documentElement.style.setProperty(key, val);
      });
      localStorage.setItem('zn_theme', theme);
    }
  },
  
  setAccent(accentName) {
    const color = this.accents[accentName];
    if (color) {
      document.documentElement.style.setProperty('--accent', color);
      localStorage.setItem('zn_accent', accentName);
    }
  },
  
  _applySystemTheme() {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const vars = this.themes[dark ? 'dark' : 'light'];
    Object.entries(vars).forEach(([key, val]) => {
      document.documentElement.style.setProperty(key, val);
    });
  },
  
  _watchSystemTheme() {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      const saved = localStorage.getItem('zn_theme') || 'auto';
      if (saved === 'auto') this._applySystemTheme();
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => themeManager.init());
} else {
  themeManager.init();
}

window.__zellous.themeManager = themeManager;
