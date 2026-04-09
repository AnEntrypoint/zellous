import { existsSync, readFileSync } from 'fs';
import logger from '@sequentialos/sequential-logging';
import { CONFIG_PATH, generateDevConfig, patchExistingConfig, start, stop } from './livekit-binary.js';

let _lkSdk = null;
let _devConfig = null;

async function getLkSdk() {
  if (!_lkSdk) _lkSdk = await import('livekit-server-sdk');
  return _lkSdk;
}

function getConfig() {
  if (process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
    return {
      url: process.env.LIVEKIT_URL,
      apiKey: process.env.LIVEKIT_API_KEY,
      apiSecret: process.env.LIVEKIT_API_SECRET,
      turnUrl: process.env.LIVEKIT_TURN_URL || '',
      turnUsername: process.env.LIVEKIT_TURN_USERNAME || '',
      turnCredential: process.env.LIVEKIT_TURN_CREDENTIAL || '',
    };
  }
  if (!_devConfig) {
    if (existsSync(CONFIG_PATH)) {
      const content = readFileSync(CONFIG_PATH, 'utf-8');
      const match = content.match(/keys:\s*\n\s+(\S+):\s+(\S+)/);
      if (match) _devConfig = { apiKey: match[1], apiSecret: match[2] };
    }
    if (!_devConfig) _devConfig = generateDevConfig();
  }
  return {
    url: 'ws://127.0.0.1:7882',
    apiKey: _devConfig.apiKey,
    apiSecret: _devConfig.apiSecret,
    turnUrl: '',
    turnUsername: '',
    turnCredential: '',
  };
}

function buildIceServers(cfg) {
  const servers = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.nextcloud.com:443'] }];
  if (cfg.turnUrl && cfg.turnUsername && cfg.turnCredential) {
    servers.push({ urls: [cfg.turnUrl], username: cfg.turnUsername, credential: cfg.turnCredential });
  }
  return servers;
}

async function initialize() {
  const cfg = getConfig();
  if (!process.env.LIVEKIT_URL) {
    patchExistingConfig();
    await start();
  }
  logger.info(`[LiveKit] Config: url=${cfg.url} apiKey=${cfg.apiKey}`);
}

export {
  getLkSdk,
  getConfig,
  buildIceServers,
  initialize as initializeLiveKit,
  stop as stopLivekitServer,
};
