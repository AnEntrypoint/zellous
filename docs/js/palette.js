// 247420 design palette — single source for role + avatar tints across UI modules.
// Loaded as a classic script; exposes globals for downstream UI files.
(function () {
  const PALETTE = {
    green:  '#3F8A4A',
    purple: '#6B3A78',
    mascot: '#F07AA8',
    sun:    '#FFD86B',
    flame:  '#FF8454',
    sky:    '#6FA9FF',
    ink:    '#0B0B09',
    paper:  '#EFE9DD',
  };
  const ROLE_COLOR = {
    owner:     PALETTE.sun,
    admin:     PALETTE.sky,
    moderator: PALETTE.green,
  };
  const AVATAR_COLORS = [
    PALETTE.green, PALETTE.sky, PALETTE.sun,
    PALETTE.flame, PALETTE.purple, PALETTE.mascot,
  ];
  window.PALETTE = PALETTE;
  window.ROLE_COLOR = ROLE_COLOR;
  window.AVATAR_COLORS = AVATAR_COLORS;
})();
