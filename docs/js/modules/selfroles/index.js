import { registerModule } from '../registry.js';
import { rulesFor } from '../../rules.js';
import { GAME_ROLES } from '../../selfroles.js';

registerModule({
  id: 'selfroles', kind: 'service',
  setup(ctx) {
    const { v, call, state, hooks } = ctx;

    const myRoles = (sid) => (ctx.selfRoles && sid && state.nostrPubkey ? ctx.selfRoles.roles(sid, state.nostrPubkey) : []);
    const roleGroups = (members, sid) => {
      const mine = (m) => (ctx.selfRoles && sid ? ctx.selfRoles.roles(sid, m.id) : []);
      const groups = GAME_ROLES.map((r) => ({ id: r.id, label: r.name, count: (members || []).filter((m) => mine(m)[0] === r.id).length }));
      groups.push({ id: 'online', label: 'Online', count: (members || []).filter((m) => !mine(m).length).length });
      return groups;
    };
    hooks.on('surface:open:pick-roles', () => { const sid = v('currentServerId', null); if (sid && ctx.selfRoles) ctx.selfRoles.subscribe(sid); });

    return {
      snapshot: () => {
        v('selfRolesVersion', 0);
        const sid = v('currentServerId', null);
        const members = v('roomMembers', []);
        const mine = myRoles(sid);
        return {
          gamePrefColor: mine.length && ctx.selfRoles.colorOf ? (ctx.selfRoles.colorOf(mine[0]) || '') : '',
          rules: rulesFor(v('channels', [])),
          roles: roleGroups(members, sid),
          rulesStats: { online: members.filter((x) => x.online).length, members: members.length },
          selfRoles: GAME_ROLES.map((r) => ({ ...r, on: mine.includes(r.id), online: ctx.selfRoles && sid ? ctx.selfRoles.holders(sid, r.id) : 0 })),
        };
      },
      actions: {
        toggleSelfRole: (id) => call(() => {
          const sid = v('currentServerId', null);
          if (!sid || !state.nostrPubkey || !ctx.selfRoles) return;
          const cur = ctx.selfRoles.roles(sid, state.nostrPubkey);
          const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
          return ctx.selfRoles.set(sid, next).catch((e) => ctx.toast('Role change failed: ' + ((e && e.message) || 'unknown')));
        }),
      },
    };
  },
});
