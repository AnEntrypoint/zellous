import { registerModule } from '../registry.js';

registerModule({
  id: 'surfaces', kind: 'service',
  setup(ctx) {
    const { S, v, call, hooks } = ctx;

    const goToGeneral = () => {
      const first = (v('channels', []) || []).find((c) => c && ctx.trait(c.type, 'defaultOpen'));
      ctx.goToChannel(first ? first.name : 'general');
    };

    return {
      snapshot: () => ({ gameSurface: v('gameSurface', null) }),
      actions: {
        openSurface: (name) => call(() => {
          if (name === 'announcements') return ctx.goToChannel('announcements');
          if (S.gameSurface) S.gameSurface.value = name;
          hooks.emit('surface:open:' + name);
        }),
        closeSurface: () => call(() => { if (S.gameSurface) S.gameSurface.value = null; hooks.emit('surface:close'); }),
        goToGeneral: () => call(goToGeneral),
      },
    };
  },
});
