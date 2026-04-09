import { ZellousCore } from './zellous-core.js';
import { createDefaultHandlers } from './default-handlers.js';
export { ZellousCore } from './zellous-core.js';
export { createDefaultHandlers } from './default-handlers.js';
export { pack, unpack } from 'msgpackr';

export async function createZellousInstance(options = {}) {
  const core = new ZellousCore(options);
  const handlers = createDefaultHandlers(core);
  for (const [type, handler] of Object.entries(handlers)) {
    core.registerHandler(type, handler);
  }
  return core;
}

export default { ZellousCore, createDefaultHandlers, createZellousInstance };
