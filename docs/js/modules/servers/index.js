import { registerModule } from '../registry.js';

registerModule({
  id: 'servers', kind: 'service',
  setup(ctx) {
    const { S, v, call, state, ww } = ctx;

    const ownerOf = (sv) => (String(sv.id).includes(':') && !String(sv.id).startsWith('0'.repeat(64)) ? String(sv.id).split(':')[0] : null);
    const ownerName = (pubkey) => (pubkey ? ((ctx.chat && ctx.chat.resolveProfile && ctx.chat.resolveProfile(pubkey)) || pubkey.slice(0, 12)) : 'nobody (public room)');
    const discover = (sv) => {
      const current = sv.id === v('currentServerId', null);
      const members = v('roomMembers', []);
      return {
        id: sv.id, name: sv.name || 'server', current,
        owner: ownerName(ownerOf(sv)),
        members: current ? members.length : null,
        online: current ? members.filter((m) => m.online).length : null,
        channels: current ? v('channels', []).filter((c) => !ctx.trait(c.type, 'voice')).map((c) => c.name) : null,
      };
    };

    const serverSettings = () => {
      const sid = v('currentServerId', null);
      const sv = (v('servers', []) || []).find((x) => x && x.id === sid);
      if (!sv || !ww.auth.pubkey || !String(sid).startsWith(ww.auth.pubkey + ':')) return null;
      const channels = (v('channels', []) || []).filter((c) => c && c.id);
      const pick = (voice) => channels.filter((c) => !!ctx.trait(c.type, 'voice') === voice).map((c) => ({ id: c.id, name: c.name }));
      return {
        id: sid, name: sv.name || '', color: sv.iconColor || '', colors: ctx.avatarColors,
        textChannels: pick(false), voiceChannels: pick(true),
        members: (v('roomMembers', []) || []).map((m) => m.username || String(m.id || '').slice(0, 8)),
      };
    };

    return {
      snapshot: () => ({
        serverSettings: serverSettings(),
        gameServerCreateOpen: v('gameServerCreateOpen', false),
        serverColors: ctx.avatarColors,
        discoverServers: v('servers', []).map(discover),
      }),
      actions: {
        openServerCreate: () => call(() => { if (S.gameServerCreateOpen) S.gameServerCreateOpen.value = true; }),
        closeServerCreate: () => call(() => { if (S.gameServerCreateOpen) S.gameServerCreateOpen.value = false; }),
        explore: () => call(() => { if (S.gameSurface) S.gameSurface.value = 'discover'; ctx.hooks.emit('surface:open:discover'); }),
        createServer: (name, color) => call(async () => {
          if (!ctx.servers || !ctx.servers.create) return;
          try {
            await ctx.servers.create(name, color);
            if (S.gameServerCreateOpen) S.gameServerCreateOpen.value = false;
          } catch (e) {
            ctx.toast('Create server failed: ' + ((e && e.message) || 'unknown'));
          }
        }),
        wave: (pubkey) => call(() => ctx.membership && ctx.membership.wave(pubkey)),
        inviteToServer: () => call(() => {
          const sv = (state.servers || []).find((x) => x && x.id === state.currentServerId);
          if (sv && ctx.membership) return ctx.membership.invite(sv.id, sv.name, sv.iconColor);
        }),
        joinInvite: (serverId, name, color) => call(async () => {
          await ctx.servers.join(serverId, { name, iconColor: color });
        }),
        saveServerSettings: (patch) => call(() => {
          const cur = serverSettings();
          if (!cur) return;
          const name = String((patch && patch.name) != null ? patch.name : cur.name).trim().slice(0, 32) || cur.name;
          return ww.servers.rename(cur.id, name, (patch && patch.color) || cur.color || undefined);
        }, 'Server settings'),
        renameServerChannel: (id, name) => call(() => ww.channels.rename(id, String(name || '').trim()), 'Rename channel'),
        deleteServerChannel: (id) => call(() => ww.channels.remove(id), 'Delete channel'),
        deleteServer: () => call(async () => {
          const cur = serverSettings();
          if (!cur) return;
          await ww.servers.delete(cur.id);
          if (S.gamePrefOpen) S.gamePrefOpen.value = false;
          const next = (v('servers', []) || [])[0];
          if (next) await ctx.servers.switchTo(next.id);
        }, 'Delete server'),
        leaveServer: () => call(() => ctx.servers.leave(state.currentServerId)),
      },
    };
  },
});
