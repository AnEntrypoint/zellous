import { registerModule } from '../registry.js';
import { SOUNDS, playSoundboard } from '../../soundboard.js';
import { createRadio } from '../../radio.js';

const TOAST_MS = 3500;

registerModule({
  id: 'voice-rooms', kind: 'service',
  setup(ctx) {
    const { v, call, state } = ctx;
    const rooms = ctx.ww.modules.protocolFor('voice-rooms').createVoiceRooms({ relayPool: ctx.ww.pool, auth: ctx.ww.auth });
    const radio = createRadio();
    const occupants = ctx.signal('occupants', {});
    const radioOn = ctx.signal('radioOn', false);
    const soundPlay = ctx.signal('soundPlay', null);
    let watched = null;
    let toastTimer = null;

    const voiceChannels = () => (state.channels || []).filter((c) => ctx.trait(c.type, 'voice'));
    const connectedName = () => (state.voiceConnected && state.voiceChannelName) || null;

    const refresh = () => {
      const serverId = state.currentServerId;
      const next = {};
      for (const c of voiceChannels()) {
        const list = rooms.occupants(serverId, c.name);
        if (list.length) next[c.id] = list.map((o) => ({ id: o.pubkey, name: ctx.nameOf(o.pubkey, o.name), muted: o.muted }));
      }
      if (JSON.stringify(next) !== JSON.stringify(occupants.value)) occupants.value = next;
      const name = connectedName();
      const on = !!(name && rooms.radioOn(serverId, name));
      if (on !== radioOn.value) radioOn.value = on;
      if (on && !radio.playing) radio.start();
      else if (!on && radio.playing) radio.stop();
    };

    const watchServer = () => {
      const serverId = state.currentServerId;
      const names = serverId ? voiceChannels().map((c) => c.name) : [];
      const key = serverId ? serverId + '|' + names.join(',') : null;
      if (key === watched) return;
      const previous = watched && watched.split('|')[0];
      watched = key;
      if (previous && previous !== serverId) rooms.unwatch(previous);
      if (serverId) rooms.watch(serverId, names).then(refresh);
    };

    const showToast = (entry) => {
      soundPlay.value = entry;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { soundPlay.value = null; }, TOAST_MS);
    };

    rooms.onChange((type, detail) => {
      if (type === 'sound') {
        if (detail.self || detail.channelName !== connectedName() || detail.serverId !== state.currentServerId) return;
        const sound = SOUNDS.find((s) => s.id === detail.soundId);
        if (!sound) return;
        showToast({ e: sound.e, name: sound.name, who: ctx.nameOf(detail.by) });
        playSoundboard(sound.id, () => v('pref_sbsounds', true) !== false);
        return;
      }
      refresh();
    });

    setInterval(() => { watchServer(); refresh(); }, 700);

    return {
      snapshot: () => ({ voiceOccupants: occupants.value, voiceRadioOn: radioOn.value, soundPlay: soundPlay.value }),
      actions: {
        playSound: (id) => call(() => {
          playSoundboard(id, () => v('pref_sbsounds', true) !== false);
          const name = connectedName();
          if (name && state.currentServerId) return rooms.playSound(state.currentServerId, name, id);
        }),
        toggleRadio: () => call(() => {
          const name = connectedName();
          if (name && state.currentServerId) return rooms.setRadio(state.currentServerId, name, !radioOn.value);
        }),
      },
    };
  },
});
