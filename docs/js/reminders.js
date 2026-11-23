const KEY = 'zellous-reminders';

const read = () => {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((r) => r && r.id && r.text && r.at) : [];
  } catch (_) {
    return [];
  }
};

const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) {} };

export const remindersFor = () => read().sort((a, b) => a.at - b.at);

export function addReminder(minutes, item) {
  const list = read();
  const body = String(item.text || '').slice(0, 160);
  list.push({ id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now() + minutes * 60000, text: item.who ? item.who + ': ' + body : body, channelId: item.channelId || null, channelName: item.channelName || '', serverId: item.serverId || null, messageId: item.messageId || null });
  write(list);
}

const flash = (id, tries = 12) => {
  const el = document.getElementById('m-' + id);
  if (!el) { if (tries > 0) setTimeout(() => flash(id, tries - 1), 250); return; }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('ds-g3-flash');
  setTimeout(() => el.classList.remove('ds-g3-flash'), 1800);
};

const jump = (r, tries = 20) => {
  const st = window.state;
  if (r.serverId && (st.currentServerId !== r.serverId || st.homeMode) && tries === 20 && window.serverManager) {
    st.homeMode = false;
    window.serverManager.switchTo(r.serverId);
  }
  const ch = st.currentServerId === r.serverId || !r.serverId ? (st.channels || []).find((c) => c.id === r.channelId) : null;
  if (!ch) { if (tries > 0) setTimeout(() => jump(r, tries - 1), 250); return; }
  if (window.ui && window.ui.actions) window.ui.actions.switchChannel(ch);
  if (r.messageId) setTimeout(() => flash(r.messageId), 400);
};

const tick = () => {
  const now = Date.now();
  const list = read();
  const due = list.filter((r) => r.at <= now);
  if (!due.length) return;
  write(list.filter((r) => r.at > now));
  due.forEach((r) => {
    if (!window.ui) return;
    const action = r.channelId ? { label: 'Go', onClick: () => jump(r) } : null;
    const title = r.messageId ? 'Reminder: message in #' + r.channelName : 'Reminder';
    window.ui.showToast(title, 8000, 'info', r.text, action);
  });
};

setInterval(tick, 1000);
tick();
