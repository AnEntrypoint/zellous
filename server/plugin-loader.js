import { promises as fsp } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import logger from '@sequentialos/sequential-logging';
import { registerHandler } from './handlers.js';
import { useMiddleware } from './middleware.js';

/**
 * @typedef {Object} Plugin
 * @property {string} name - Plugin identifier
 * @property {function(): {path: string, router: import('express').Router}} [routes] - Express route factory
 * @property {Object.<string, function>} [handlers] - WebSocket message handlers keyed by type
 * @property {function(Object, Object, function): Promise<void>} [middleware] - WebSocket middleware
 * @property {Object.<string, function>} [onEvent] - Event bus subscriptions keyed by event type
 */

/**
 * Discover and load all plugins from the plugins directory.
 * @param {import('express').Application} app - Express app instance
 * @param {Object} eventEmitter - EventEmitter instance to subscribe events on
 * @param {string} pluginsDir - Directory to scan for plugins
 * @returns {Promise<Plugin[]>} Loaded plugins
 */
const loadPlugins = async (app, eventEmitter, pluginsDir) => {
  const absDir = resolve(pluginsDir);
  let entries;
  try {
    entries = await fsp.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const plugins = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const filePath = join(absDir, entry.name);
    try {
      const plugin = await import(pathToFileURL(filePath).href);
      const name = plugin.name || entry.name.replace('.js', '');

      if (plugin.routes && app) {
        const { path, router } = plugin.routes();
        app.use(path, router);
        logger.info(`[Plugins] ${name}: routes registered at ${path}`);
      }

      if (plugin.handlers) {
        for (const [type, fn] of Object.entries(plugin.handlers)) {
          registerHandler(type, fn);
        }
        logger.info(`[Plugins] ${name}: handlers registered (${Object.keys(plugin.handlers).join(', ')})`);
      }

      if (plugin.middleware) {
        useMiddleware(plugin.middleware);
        logger.info(`[Plugins] ${name}: middleware registered`);
      }

      if (plugin.onEvent && eventEmitter) {
        for (const [event, fn] of Object.entries(plugin.onEvent)) {
          eventEmitter.on(event, fn);
        }
        logger.info(`[Plugins] ${name}: subscribed to events (${Object.keys(plugin.onEvent).join(', ')})`);
      }

      plugins.push({ ...plugin, name });
    } catch (e) {
      logger.error(`[Plugins] Failed to load ${entry.name}:`, e.message);
    }
  }

  if (plugins.length > 0) {
    logger.info(`[Plugins] Loaded ${plugins.length} plugin(s): ${plugins.map(p => p.name).join(', ')}`);
  }

  return plugins;
};

export { loadPlugins };
