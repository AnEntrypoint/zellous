import { registerModule } from '../registry.js';

registerModule({
  id: 'servers', kind: 'service',
  setup(ctx) {
    const { S, v, call, state } = ctx;

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

    return {
      snapshot: () => ({
        gameServerCreateOpen: v('gameServerCreateOpen', false),
        serverColors: ctx.avatarColors,
        discoverServers: v('servers', []).map(discover),
      }),
      actions: {
        openServerCreate: () => call(() => { if (S.gameServerCreateOpen) S.gameServerCreateOpen.value = true; }),
        closeServerCreate: () => call(() => { if (S.gameServerCreateOpen) S.gameServerCreateOpen.value = false; }),
        explore: () => call(() => { if (S.gameSurface) S.gameSurface.value = 'discover'; }),
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
          const known = (state.servers || []).some((x) => x && x.id === serverId);
          await ctx.servers.join(serverId, { name, iconColor: color });
          if (!known && ctx.membership) await ctx.membership.announceWhenReady(serverId);
        }),
        leaveServer: () => call(() => ctx.servers.leave(state.currentServerId)),
      },
    };
  },
});
