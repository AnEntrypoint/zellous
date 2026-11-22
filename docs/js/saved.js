const KEY = 'zellous-saved';

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };

const write = (list) => {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200))); } catch (_) {}
  const sig = window.stateSignals && window.stateSignals.savedVersion;
  if (sig) sig.value += 1;
};

export const savedList = () => read();

export function toggleSaved(item) {
  const list = read();
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list.splice(i, 1); else list.unshift({ id: item.id, who: item.who, text: item.text });
  write(list);
}
