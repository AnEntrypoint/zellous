const KEY = 'zellous-reminders';

export const remindersFor = () => {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((r) => r && r.id && r.text && r.at).sort((a, b) => a.at - b.at) : [];
  } catch (_) {
    return [];
  }
};
