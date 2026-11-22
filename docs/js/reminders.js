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
  list.push({ id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now() + minutes * 60000, text: item.who + ': ' + String(item.text || '').slice(0, 160) });
  write(list);
}

const tick = () => {
  const now = Date.now();
  const list = read();
  const due = list.filter((r) => r.at <= now);
  if (!due.length) return;
  write(list.filter((r) => r.at > now));
  due.forEach((r) => window.ui && window.ui.showToast('Reminder', 8000, 'info', r.text));
};

setInterval(tick, 15000);
tick();
