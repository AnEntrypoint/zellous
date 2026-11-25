import { registerModule } from '../registry.js';

const SETTINGS_KEY = 'zellous-vt-settings';
const RNNOISE_URL = new URL('../../../vendor/rnnoise/dist/generated/rnnoise-sync.js', import.meta.url).href;

const LAG_TICK_MS = 400;
const PROFILE_KEY = 'zellous-vad-profile';
const PROFILE_IDS = ['strict', 'balanced', 'lenient'];
const PROFILE_LABELS = { strict: 'Strict', balanced: 'Balanced', lenient: 'Lenient' };

const readKeep = () => {
  try { return !!JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').keep; } catch { return false; }
};

const readProfile = () => {
  try { const id = localStorage.getItem(PROFILE_KEY); return PROFILE_IDS.includes(id) ? id : 'balanced'; } catch { return 'balanced'; }
};

registerModule({
  id: 'voice-thread',
  kind: 'channelType',
  channelType: { type: 'voice-thread', label: 'Voice thread', searchGlyph: 'voice', createOption: { label: 'Voice thread', order: 6 }, traits: { inRail: true, members: true, micMode: 'realtime' } },
  setup(ctx) {
    const proto = ctx.ww.modules.protocolFor('voice-thread');
    const vad = ctx.ww.modules.vad;
    const view = ctx.signal('view', null);
    const settings = ctx.signal('settings', { keep: readKeep() });
    const profile = ctx.signal('vadProfile', readProfile());
    const profiles = PROFILE_IDS.map((id) => ({ id, label: PROFILE_LABELS[id], ...vad.VAD_PROFILE_MEASURED[id] }));
    let joinedProfile = profile.value;
    const status = ctx.signal('status', { joined: false, joining: false, filtered: 0, level: 0, voiced: false, speaking: [] });
    const overrideServers = (() => { try { const v = JSON.parse(localStorage.getItem('zellous-blossom-servers') || 'null'); return Array.isArray(v) ? v.filter((u) => /^https:\/\/|^http:\/\/(127\.0\.0\.1|localhost)/.test(String(u))) : []; } catch { return []; } })();
    if (overrideServers.length) ctx.ww.media.servers = overrideServers;
    let bound = null;
    let channel = null;
    const listeners = [];
    let ticker = null;

    const sameValue = (x, y) => x === y || (Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((v, i) => v === y[i]));
    const patch = (p) => { const cur = status.value; if (Object.keys(p).every((k) => sameValue(cur[k], p[k]))) return; status.value = { ...cur, ...p }; };
    let levelWrittenAt = 0;
    const refresh = () => { view.value = bound ? bound.thread.snapshot() : null; };

    const factory = () => ({ sampleRate }) => vad.createVoiceDetector({ loader: vad.createRnnoiseLoader(() => import(RNNOISE_URL)), sampleRate, profile: joinedProfile });

    const leave = async () => {
      listeners.splice(0).forEach((off) => off());
      clearInterval(ticker);
      ticker = null;
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
      joinedProfile = profile.value;
      const session = ctx.voice.session();
      session.createClipVad = factory();
      session.setPttMode(false);
      try {
        await ctx.voice.connect(current.name);
      } catch (e) { patch({ joining: false }); throw e; }
      channel = current;
      bound = proto.createVoiceThread({ voice: session, media: ctx.ww.media, channelId: current.id, keepClips: settings.value.keep, vadLoader: vad.createRnnoiseLoader(() => import(RNNOISE_URL)), vadProfile: joinedProfile, onDropped: () => patch({ filtered: status.value.filtered + 1 }), onWarning: (message) => ctx.toast(message) });
      const on = (target, type, fn) => { target.addEventListener(type, fn); listeners.push(() => target.removeEventListener(type, fn)); };
      on(bound.thread, 'state', refresh);
      on(session, 'speaker', (e) => {
        const { key, isLocal, speaking } = e.detail;
        if (isLocal) return;
        const others = status.value.speaking.filter((x) => x !== key);
        patch({ speaking: speaking ? [...others, key] : others });
      });
      on(session, 'local-level', (e) => {
        const level = Math.round(e.detail.level * 10) / 10;
        const now = performance.now();
        if (level !== 0 && now - levelWrittenAt < 250) return;
        levelWrittenAt = now;
        patch({ level, voiced: !!(session.clipVad && session.clipVad.voiceActive) });
      });
      on(session, 'disconnected', () => { if (bound) { leave(); } });
      ticker = setInterval(() => { const snap = bound && bound.thread.snapshot(); if (snap && snap.lanes.some((l) => l.stretch && l.stretch.state !== 'live')) view.value = snap; }, LAG_TICK_MS);
      patch({ joined: true, joining: false });
      refresh();
      loadHistory(current).catch(() => {});
    };

    const loadHistory = async (current) => {
      const channelHex = await proto.hexChannelId(current.id, ctx.state.currentServerId);
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
        const tenths = (ms) => Math.round((ms || 0) / 100) / 10;
        const lanes = snap ? snap.lanes.map((l) => ({ id: l.speaker, name: l.name || String(l.speaker).slice(0, 8), speaking: st.speaking.includes(l.speaker), state: l.stretch ? l.stretch.state : 'live', lagSeconds: l.stretch ? tenths(l.stretch.lagMs) : 0, droppedSeconds: l.stretch ? tenths(l.stretch.droppedVoicedMs) : 0, rate: l.stretch ? l.stretch.rate : 1, clips: [...snap.history.filter((c) => c.speaker === l.speaker).map((c) => ({ seq: c.seq, seconds: seconds(c), state: c.expired ? 'expired' : 'played' })), ...snap.expired.filter((c) => c.speaker === l.speaker).map((c) => ({ seq: c.seq, seconds: seconds(c), state: 'expired' })), ...(snap.current && snap.current.speaker === l.speaker ? [{ seq: snap.current.seq, seconds: seconds(snap.current), state: 'playing' }] : []), ...l.clips.map((c) => ({ seq: c.seq, seconds: seconds(c), state: 'queued' }))] })) : [];
        const stretches = snap ? snap.lanes.filter((l) => l.stretch && l.stretch.state === 'behind').map((l) => ({ key: 'live-' + l.speaker, label: 'live', name: l.name, seconds: tenths(l.stretch.lagMs), state: 'queued' })) : [];
        const stack = snap ? [...(snap.current ? [{ key: snap.current.id, seq: snap.current.seq, label: snap.current.source === 'live' ? 'live' : undefined, name: snap.current.name, seconds: seconds(snap.current), state: 'playing' }] : []), ...snap.lanes.flatMap((l) => l.clips.map((c) => ({ key: c.id, seq: c.seq, name: c.name || l.name, seconds: seconds(c), state: 'queued' }))), ...stretches] : [];
        const catchingUp = lanes.filter((l) => l.state === 'catching-up').map((l) => ({ name: l.name, lagSeconds: l.lagSeconds }));
        const ch = ctx.state.currentChannel;
        return { vadProfile: profile.value, vadProfiles: profiles, voiceThread: { connected: st.joined && !!channel && ch && ch.id === channel.id, joining: st.joining, ownTalk: !!(snap && snap.localTalking), paused: !!(snap && snap.userPaused), videos: Object.keys(ctx.state.voiceVideos || {}), liveSpeakers: st.speaking.map((id) => ({ id, name: String(id).slice(0, 8) })), lanes, stack, catchingUp, vad: { level: st.level, voiced: st.voiced }, filtered: st.filtered, settings: settings.value, vadProfile: profile.value, vadProfiles: profiles } };
      },
      actions: {
        voiceThreadJoin: () => ctx.guard(join),
        voiceThreadLeave: () => ctx.guard(leave),
        voiceThreadPlay: (seq) => { if (bound) { const c = clipById(seq); if (c) bound.thread.play(); } },
        voiceThreadReplay: (seq) => { if (bound) { const c = clipById(seq); if (c) bound.thread.replay(c.id); } },
        voiceThreadSkip: () => { if (bound) bound.thread.skip(); },
        voiceThreadPause: () => { if (bound) bound.thread.pause(); },
        voiceThreadVadProfile: (id) => { if (!PROFILE_IDS.includes(id)) return; profile.value = id; try { localStorage.setItem(PROFILE_KEY, id); } catch { } },
        voiceThreadKeep: (on) => { settings.value = { ...settings.value, keep: !!on }; localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value)); if (bound) bound.setKeepClips(!!on); },
      },
    };
  },
});
