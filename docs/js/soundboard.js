export const SOUNDS = [
  { id: 'airhorn', e: '📯', name: 'airhorn', notes: [[350, 0.35, 'sawtooth'], [440, 0.45, 'sawtooth']] },
  { id: 'rimshot', e: '🥁', name: 'ba dum tss', notes: [[200, 0.12, 'square'], [200, 0.12, 'square'], [150, 0.4, 'square']] },
  { id: 'applause', e: '👏', name: 'applause', notes: [[900, 0.05, 'square'], [1100, 0.05, 'square'], [800, 0.05, 'square'], [1000, 0.05, 'square'], [950, 0.08, 'square']] },
  { id: 'crickets', e: '🦗', name: 'crickets', notes: [[3800, 0.04, 'sine'], [0, 0.1, 'sine'], [3800, 0.04, 'sine'], [0, 0.1, 'sine'], [3800, 0.04, 'sine']] },
  { id: 'trombone', e: '🎺', name: 'sad trombone', notes: [[311, 0.3, 'sawtooth'], [293, 0.3, 'sawtooth'], [277, 0.3, 'sawtooth'], [261, 0.7, 'sawtooth']] },
  { id: 'boom', e: '💥', name: 'boom', notes: [[90, 0.6, 'sine']] },
];

export function playSoundboard(id, enabled) {
  if (!enabled()) return false;
  const sound = SOUNDS.find((s) => s.id === id);
  if (!sound || typeof AudioContext === 'undefined') return false;
  playSoundboard.ctx = playSoundboard.ctx || new AudioContext();
  const ctx = playSoundboard.ctx;
  let t = ctx.currentTime;
  for (const [freq, dur, type] of sound.notes) {
    if (freq > 0) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    }
    t += dur;
  }
  return true;
}
