const modules = new Map();
const types = new Map();
const builders = [];
let context = null;

const need = (cond, id, message) => { if (!cond) throw new Error('module ' + id + ': ' + message); };
const KINDS = ['channelType', 'serverType', 'settingsPane', 'surface', 'messageKind', 'popover'];

export function registerModule(m) {
  need(m && typeof m.id === 'string' && /^[a-z][a-z0-9-]*$/.test(m.id), m && m.id, 'id must be lowercase letters, digits and dashes');
  need(KINDS.includes(m.kind), m.id, 'kind must be one of ' + KINDS.join(', '));
  need(!modules.has(m.id), m.id, 'already registered');
  if (m.kind === 'channelType') {
    const t = m.channelType;
    need(t && typeof t.type === 'string' && t.label, m.id, 'channelType needs type and label');
    need(!types.has(t.type), m.id, 'channel type ' + t.type + ' is already registered');
    types.set(t.type, { module: m.id, traits: {}, ...t });
  }
  if (m.snapshot || m.actions) builders.push({ id: m.id, snapshot: m.snapshot, actions: m.actions });
  modules.set(m.id, m);
  return m.id;
}

export const setContext = (ctx) => { context = ctx; };
export const getContext = () => context;
export const moduleList = () => [...modules.keys()];
export const channelType = (type) => types.get(type) || types.get('text');
export const hasChannelType = (type) => types.has(type);
export const trait = (type, name) => channelType(type).traits[name];
export const createOptions = () => [...types.values()].filter((t) => t.createOption).map((t) => ({ value: t.type, label: t.createOption.label || t.label, order: t.createOption.order || 100 })).sort((a, b) => a.order - b.order);
export const typeLabel = (type) => (types.has(type) ? types.get(type).label : String(type));
export const searchGlyph = (type) => channelType(type).searchGlyph || '#';
export const composerAdminOnly = (type) => channelType(type).traits.composer === 'admin';

export function openChannel(channel) {
  const t = channelType(channel.type);
  const ctx = context;
  if (t.traits.history && ctx) { ctx.state.chatMessages = []; if (ctx.chat && ctx.chat.loadHistory) ctx.chat.loadHistory(channel.id); }
  if (t.onOpen && ctx) t.onOpen(channel, ctx);
}

export const moduleBuilders = (deps) => builders.map((b) => ({ snapshot: b.snapshot ? (f) => b.snapshot(deps, f) : () => ({}), actions: b.actions ? b.actions(deps) : {} }));
