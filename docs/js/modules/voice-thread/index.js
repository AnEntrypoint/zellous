import { registerModule } from '../registry.js';

const SETTINGS_KEY = 'zellous-vt-settings';
const RNNOISE_URL = new URL('../../../vendor/rnnoise/dist/generated/rnnoise-sync.js', import.meta.url).href;

const readSettings = () => {
  try { const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); return { sensitivity: typeof v.sensitivity === 'number' ? v.sensitivity : 0.5, keep: !!v.keep }; } catch { return { sensitivity: 0.5, keep: false }; }
};

const thresholdsFor = (sensitivity) => { const start = 0.85 - 0.4 * sensitivity; return { startThreshold: start, stopThreshold: Math.max(0.1, start - 0.2) }; };

registerModule({
  id: 'voice-thread',
  kind: 'channelType',
  channelType: { type: 'voice-thread', label: 'Voice thread', searchGlyph: 'voice', createOption: { label: 'Voice thread', order: 6 }, traits: { inRail: true, members: true, micMode: 'realtime' } },
  setup(ctx) {
    const proto = ctx.ww.modules.protocolFor('voice-thread');
    const vad = ctx.ww.modules.vad;
    const view = ctx.signal('view', null);
    const settings = ctx.signal('settings', readSettings());
    const status = ctx.signal('status', { joined: false, joining: false, filtered: 0, level: 0, voiced: false, speaking: [] });
    const overrideServers = (() => { try { const v = JSON.parse(localStorage.getItem('zellous-blossom-servers') || 'null'); return Array.isArray(v) ? v.filter((u) => /^https:\/\/|^http:\/\/(127\.0\.0\.1|localhost)/.test(String(u))) : []; } catch { return []; } })();
    if (overrideServers.length) ctx.ww.media.servers = overrideServers;
    let bound = null;
    let channel = null;
    const listeners = [];

    const patch = (p) => { status.value = { ...status.value, ...p }; };
    const refresh = () => { view.value = bound ? bound.thread.snapshot() : null; };

    const factory = () => ({ sampleRate }) => vad.createVoiceDetector({ loader: vad.createRnnoiseLoader(() => import(RNNOISE_URL)), sampleRate, config: thresholdsFor(settings.value.sensitivity) });

    const leave = async () => {
      listeners.splice(0).forEach((off) => off());
      if (bound) { bound.unbind(); bound = null; }
      if (ctx.voice && ctx.state.voiceConnected) ctx.voice.disconnect();
      channel = null;
      patch({ joined: false, joining: false, speaking: [], level: 0, voiced: false });
      refresh();
    };

    const join = async () => {
      const current = ctx.state.currentChannel;
      if (!current || current.type !== 'voice-thread') throw new Error('Open a voice thread first');
      if (bound) return;
      patch({ joining: true });
      const session = ctx.voice.session();
      session.createClipVad = factory();
      session.setPttMode(false);
      try {
        await ctx.voice.connect(current.name);
      } catch (e) { patch({ joining: false }); throw e; }
      channel = current;
      bound = proto.createVoiceThread({ voice: session, media: ctx.ww.media, channelId: current.id, keepClips: settings.value.keep, onDropped: () => patch({ filtered: status.value.filtered + 1 }) });
      const on = (target, type, fn) => { target.addEventListener(type, fn); listeners.push(() => target.removeEventListener(type, fn)); };
      on(bound.thread, 'state', refresh);
      on(session, 'speaker', (e) => {
        const { key, isLocal, speaking } = e.detail;
        if (isLocal) return;
        const others = status.value.speaking.filter((x) => x !== key);
        patch({ speaking: speaking ? [...others, key] : others });
      });
      on(session, 'local-level', (e) => patch({ level: e.detail.level, voiced: !!(session.clipVad && session.clipVad.voiceActive) }));
      on(session, 'disconnected', () => { if (bound) { leave(); } });
      patch({ joined: true, joining: false });
      refresh();
      loadHistory(current).catch(() => {});
    };

    const loadHistory = async (current) => {
      const channelHex = await proto.hexChannelId(current.id, ctx.state.currentServerId || '');
      const clips = await proto.verifyKeptClips(await proto.fetchKeptClips({ relayPool: ctx.ww.pool, channelHex }));
      if (!bound || channel !== current) return;
      for (const clip of clips) bound.thread.addHistory({ ...clip, name: ctx.chat && ctx.chat.resolveProfile ? ctx.chat.resolveProfile(clip.speaker) : String(clip.speaker).slice(0, 8) });
      refresh();
    };

    const clipById = (seq) => {
      const snap = bound && bound.thread.snapshot();
      if (!snap) return null;
      const all = [...(snap.current ? [snap.current] : []), ...snap.lanes.flatMap((l) => l.clips), ...snap.history];
      return all.find((c) => c.seq === seq) || null;
    };

    return {
      snapshot: () => {
        const snap = view.value;
        const st = status.value;
        const seconds = (c) => Math.round((c.durationMs || 0) / 100) / 10;
        const lanes = snap ? snap.lanes.map((l) => ({ id: l.speaker, name: l.name || String(l.speaker).slice(0, 8), speaking: st.speaking.includes(l.speaker), clips: [...snap.history.filter((c) => c.speaker === l.speaker).map((c) => ({ seq: c.seq, seconds: seconds(c), state: c.expired ? 'expired' : 'played' })), ...snap.expired.filter((c) => c.speaker === l.speaker).map((c) => ({ seq: c.seq, seconds: seconds(c), state: 'expired' })), ...(snap.current && snap.current.speaker === l.speaker ? [{ seq: snap.current.seq, seconds: seconds(snap.current), state: 'playing' }] : []), ...l.clips.map((c) => ({ seq: c.seq, seconds: seconds(c), state: 'queued' }))] })) : [];
        const stack = snap ? [...(snap.current ? [{ seq: snap.current.seq, name: snap.current.name, seconds: seconds(snap.current), state: 'playing' }] : []), ...snap.lanes.flatMap((l) => l.clips.map((c) => ({ seq: c.seq, name: c.name || l.name, seconds: seconds(c), state: 'queued' })))] : [];
        const ch = ctx.state.currentChannel;
        return { voiceThread: { connected: st.joined && !!channel && ch && ch.id === channel.id, joining: st.joining, ownTalk: !!(snap && snap.localTalking), paused: !!(snap && snap.userPaused), videos: Object.keys(ctx.state.voiceVideos || {}), liveSpeakers: st.speaking.map((id) => ({ id, name: String(id).slice(0, 8) })), lanes, stack, vad: { level: st.level, voiced: st.voiced }, filtered: st.filtered, settings: settings.value } };
      },
      actions: {
        voiceThreadJoin: () => ctx.guard(join),
        voiceThreadLeave: () => ctx.guard(leave),
        voiceThreadPlay: (seq) => { if (bound) { const c = clipById(seq); if (c) bound.thread.play(); } },
        voiceThreadReplay: (seq) => { if (bound) { const c = clipById(seq); if (c) bound.thread.replay(c.id); } },
        voiceThreadSkip: () => { if (bound) bound.thread.skip(); },
        voiceThreadPause: () => { if (bound) bound.thread.pause(); },
        voiceThreadSensitivity: (value) => { settings.value = { ...settings.value, sensitivity: value }; localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value)); },
        voiceThreadKeep: (on) => { settings.value = { ...settings.value, keep: !!on }; localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value)); if (bound) bound.setKeepClips(!!on); },
      },
    };
  },
});
