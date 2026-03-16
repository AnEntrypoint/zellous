export { ZellousCore } from './zellous-core.js';
export { createDefaultHandlers } from './default-handlers.js';
export { createMemoryAdapter } from './storage-adapter.js';
export { pack, unpack } from 'msgpackr';

/**
 * @typedef {Object} ZellousOptions
 * @property {string} [url] - Server URL (used by client-side SDK)
 * @property {string} [dataRoot='./data'] - Data root directory
 * @property {number} [port=3000] - Server port
 * @property {string} [host='0.0.0.0'] - Server bind host
 * @property {boolean} [enableAuth=true] - Enable authentication
 * @property {boolean} [enableBots=true] - Enable bot support
 * @property {number} [cleanupInterval=600000] - Room cleanup interval ms
 */

/**
 * Create a ZellousCore instance with default handlers registered.
 * @param {string|ZellousOptions} [options] - URL string or options object
 * @returns {Promise<import('./zellous-core.js').ZellousCore>}
 * @example
 * const zellous = await createZellousInstance();
 * const zellous = await createZellousInstance('http://localhost:3000');
 * const zellous = await createZellousInstance({ port: 3001 });
 */
export async function createZellousInstance(options = {}) {
  const { ZellousCore } = await import('./zellous-core.js');
  const { createDefaultHandlers } = await import('./default-handlers.js');

  const opts = typeof options === 'string'
    ? { url: options.replace(/\/$/, '') }
    : options;

  const core = new ZellousCore(opts);

  const handlers = createDefaultHandlers(core);
  for (const [type, handler] of Object.entries(handlers)) {
    core.registerHandler(type, handler);
  }

  return core;
}

export default createZellousInstance;
