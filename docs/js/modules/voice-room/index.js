import { registerModule } from '../registry.js';

const HOLD_KEY = 'Space';
const MODE_EVENT = 'zellous:voice-mode';

const typing = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

registerModule({
  id: 'voice-room',
  kind: 'service',
  setup(ctx) {
    let held = false;
    let vadActive = false;
    let connected = false;
    const offs = [];

    const modeFor = (channel) => {
      if (!channel) return 'ptt';
      const fromType = ctx.trait && ctx.trait(channel.type, 'micMode');
      if (fromType) return fromType;
      if (ctx.state.vadEnabled) return 'vad';
      if (channel.voiceMode) return channel.voiceMode;
      try { return localStorage.getItem('zn_voice_mode_' + channel.id) || 'ptt'; } catch { return 'ptt'; }
    };
    const currentMode = () => modeFor(ctx.state.currentChannel);
    const setLabel = (label, disabled) => { ctx.state.pttLabel = label; ctx.state.pttDisabled = disabled; };
    const setPill = (value) => { ctx.state.pttState = value; };

    const holdStart = () => {
      if (held || !connected || currentMode() === 'realtime' || ctx.state.voiceDeafened || !ctx.voice) return;
      held = true;
      ctx.voice.setMuted(false);
      setPill('live');
    };
    const holdEnd = () => {
      if (!held) return;
      held = false;
      if (ctx.voice && currentMode() !== 'realtime') ctx.voice.setMuted(true);
      setPill('idle');
    };

    const apply = () => {
      const mode = currentMode();
      if (!ctx.voice) return;
      if (mode === 'realtime') { ctx.voice.setMuted(false); setLabel('Live', true); setPill('realtime'); return; }
      ctx.voice.setMuted(true);
      setLabel(mode === 'vad' ? 'Voice-activated' : 'Hold to talk', mode === 'vad');
      setPill('idle');
    };

    const onLocalSpeaker = (e) => {
      if (currentMode() !== 'vad' || !e.detail || e.detail.isLocal !== true) return;
      if (e.detail.speaking && !vadActive) { vadActive = true; holdStart(); }
      else if (!e.detail.speaking && vadActive) { vadActive = false; holdEnd(); }
    };

    const onConnected = () => {
      connected = true;
      apply();
      if (ctx.voice && ctx.voice.on) offs.push(ctx.voice.on('speaker', onLocalSpeaker));
    };
    const onDisconnected = () => {
      connected = false; vadActive = false; held = false;
      while (offs.length) { try { offs.pop()(); } catch {} }
    };

    let last = false;
    setInterval(() => {
      const now = !!ctx.state.voiceConnected;
      if (now === last) return;
      last = now;
      if (now) onConnected(); else onDisconnected();
    }, 250);

    document.addEventListener(MODE_EVENT, () => { if (connected) apply(); });
    window.addEventListener('keydown', (e) => { if (!connected || e.code !== HOLD_KEY || e.repeat || typing(e.target)) return; e.preventDefault(); holdStart(); });
    window.addEventListener('keyup', (e) => { if (e.code !== HOLD_KEY || typing(e.target)) return; holdEnd(); });
    window.addEventListener('blur', holdEnd);
    document.addEventListener('visibilitychange', () => { if (document.hidden) holdEnd(); });

    return { actions: { pttStart: () => holdStart(), pttStop: () => holdEnd() } };
  },
});
