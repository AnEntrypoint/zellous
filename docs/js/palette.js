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
    owner:     '#f0b232',
    admin:     PALETTE.sky,
    moderator: PALETTE.green,
  };
  const AVATAR_COLORS = [
    PALETTE.green, PALETTE.sky, PALETTE.sun,
    PALETTE.flame, PALETTE.purple, PALETTE.mascot,
  ];
  window.__zellous.helpers = Object.assign(window.__zellous.helpers || {}, { ROLE_COLOR, AVATAR_COLORS });
})();
