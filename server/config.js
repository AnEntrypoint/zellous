/**
 * @typedef {Object} ZellousConfig
 * @property {number} port - HTTP server port (default: 3000)
 * @property {string} host - Bind address (default: 0.0.0.0)
 * @property {string} dataDir - Data directory (default: ./data)
 * @property {string} pluginsDir - Plugins directory (default: ./plugins)
 * @property {string} corsOrigins - CORS origins (default: *)
 * @property {number} cleanupTimeout - Room cleanup timeout ms (default: 600000)
 * @property {number} pingInterval - WS ping interval ms (default: 30000)
 * @property {string} maxBodySize - Max request body size (default: 50mb)
 * @property {number} sessionTtl - Session lifetime ms (default: 7 days)
 * @property {string|null} busybaseUrl - Remote busybase URL (null = embedded)
 * @property {string} busybaseKey - Busybase API key (default: local)
 * @property {Object} livekit - LiveKit configuration
 * @property {string} frameAncestors - CSP frame-ancestors value
 * @property {Array<Object>} defaultChannels - Default room channels
 * @property {Array<Object>} defaultCategories - Default room categories
 */

import { watch } from 'fs';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIG_FILE = process.env.CONFIG_FILE || join(ROOT, 'zellous.config.js');
const CONFIG_JSON = join(ROOT, 'zellous.config.json');

let _fileConfig = {};
let _currentConfig = null;
const _listeners = [];

const loadFileConfig = () => {
  const jsonPath = CONFIG_JSON;
  const jsPath = CONFIG_FILE;
  if (existsSync(jsonPath)) {
    try { _fileConfig = JSON.parse(readFileSync(jsonPath, 'utf8')); } catch (e) { console.error('[Config] Invalid JSON in zellous.config.json:', e.message); }
  } else if (existsSync(jsPath) && jsPath.endsWith('.json')) {
    try { _fileConfig = JSON.parse(readFileSync(jsPath, 'utf8')); } catch (e) { console.error('[Config] Invalid JSON in config file:', e.message); }
  }
};

loadFileConfig();

const buildConfig = (overrides = {}) => {
  const merged = { ..._fileConfig, ...overrides };
  return {
    port: merged.port ?? parseInt(process.env.PORT || '3000'),
    host: merged.host ?? (process.env.HOST || '0.0.0.0'),
    dataDir: merged.dataDir ?? (process.env.DATA_DIR || './data'),
    pluginsDir: merged.pluginsDir ?? (process.env.PLUGINS_DIR || './plugins'),
    corsOrigins: merged.corsOrigins ?? (process.env.CORS_ORIGINS || '*'),
    cleanupTimeout: merged.cleanupTimeout ?? parseInt(process.env.CLEANUP_TIMEOUT || '600000'),
    pingInterval: merged.pingInterval ?? parseInt(process.env.PING_INTERVAL || '30000'),
    maxBodySize: merged.maxBodySize ?? (process.env.MAX_BODY_SIZE || '50mb'),
    sessionTtl: merged.sessionTtl ?? parseInt(process.env.SESSION_TTL || String(7 * 24 * 60 * 60 * 1000)),
    busybaseUrl: merged.busybaseUrl ?? (process.env.BUSYBASE_URL || null),
    busybaseKey: merged.busybaseKey ?? (process.env.BUSYBASE_KEY || 'local'),
    livekit: {
      url: merged.livekit?.url ?? (process.env.LIVEKIT_URL || null),
      apiKey: merged.livekit?.apiKey ?? (process.env.LIVEKIT_API_KEY || null),
      apiSecret: merged.livekit?.apiSecret ?? (process.env.LIVEKIT_API_SECRET || null),
      turnUrl: merged.livekit?.turnUrl ?? (process.env.LIVEKIT_TURN_URL || null),
      turnUser: merged.livekit?.turnUser ?? (process.env.LIVEKIT_TURN_USER || null),
      turnCredential: merged.livekit?.turnCredential ?? (process.env.LIVEKIT_TURN_CREDENTIAL || null),
      httpPort: merged.livekit?.httpPort ?? parseInt(process.env.LIVEKIT_HTTP_PORT || '7882'),
    },
    frameAncestors: merged.frameAncestors ?? (process.env.FRAME_ANCESTORS || "'self' https://os.247420.xyz https://*.247420.xyz http://localhost:* http://127.0.0.1:*"),
    defaultChannels: merged.defaultChannels ?? [
      { id: 'general', type: 'text', name: 'general', categoryId: 'text-channels', position: 0 },
      { id: 'voice', type: 'voice', name: 'Voice Chat', categoryId: 'voice-channels', position: 0 },
      { id: 'queue', type: 'threaded', name: 'Audio Queue', categoryId: 'voice-channels', position: 1 },
    ],
    defaultCategories: merged.defaultCategories ?? [
      { id: 'text-channels', name: 'Text Channels', position: 0, collapsed: false },
      { id: 'voice-channels', name: 'Voice Channels', position: 1, collapsed: false },
    ],
  };
};

/**
 * Create a config object merging file config, env vars, and overrides.
 * Env vars take precedence over file config. Overrides take precedence over both.
 * @param {Partial<ZellousConfig>} [overrides={}]
 * @returns {ZellousConfig}
 */
const createConfig = (overrides = {}) => buildConfig(overrides);

const getConfig = (overrides = {}) => {
  if (!_currentConfig) _currentConfig = buildConfig(overrides);
  return _currentConfig;
};

const watchConfig = (callback) => {
  const watchPaths = [CONFIG_JSON, CONFIG_FILE].filter(existsSync);
  if (!watchPaths.length) return null;
  const watchers = watchPaths.map(p => {
    try {
      return watch(p, { persistent: false }, () => {
        const prev = _currentConfig;
        loadFileConfig();
        _currentConfig = buildConfig();
        if (callback) callback(_currentConfig, prev);
        _listeners.forEach(fn => { try { fn(_currentConfig, prev); } catch {} });
      });
    } catch { return null; }
  });
  return { close: () => watchers.forEach(w => w?.close()) };
};

const onConfigChange = (fn) => { _listeners.push(fn); return () => { const i = _listeners.indexOf(fn); if (i > -1) _listeners.splice(i, 1); }; };

export { createConfig, getConfig, watchConfig, onConfigChange };
