const getInitial = (name) => (name || '?')[0].toUpperCase();
const avatarColors = ['#5865f2','#57f287','#feb347','#fe7168','#9b59b6','#1abc9c','#e67e22','#e74c3c'];
const getAvatarColor = (id) => avatarColors[Math.abs(typeof id === 'number' ? id : [...(id||'')].reduce((a,c)=>a+c.charCodeAt(0),0)) % avatarColors.length];
const escHtml = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const formatTime = (ts) => {
  const d = new Date(ts), now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return 'Today at ' + time;
  const y = new Date(now); y.setDate(y.getDate()-1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday at ' + time;
  return d.toLocaleDateString() + ' ' + time;
};
const chIcon = (type) => {
  if (!window.getIcon) return { text:'#', voice:'🔊', threaded:'📋', announcement:'📢', forum:'💬', thread:'🧵', page:'🔗', game:'🎮' }[type] || '#';
  const map = { text:'text', voice:'voiceAlt', threaded:'ptt', announcement:'announcement', forum:'forum', thread:'thread', stage:'stage', page:'link', game:'game' };
  return getIcon(map[type] || 'text');
};


window.getInitial = getInitial;
window.getAvatarColor = getAvatarColor;
window.escHtml = escHtml;
window.formatTime = formatTime;
window.chIcon = chIcon;
