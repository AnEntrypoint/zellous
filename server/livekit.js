import { spawn, execSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync, mkdirSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { get } from 'https';
import logger from '@sequentialos/sequential-logging';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BIN_DIR = join(ROOT, 'bin');
const BINARY_PATH = join(BIN_DIR, 'livekit-server');
const CONFIG_PATH = join(ROOT, 'livekit.yaml');

let _lkSdk = null;
let _childProcess = null;
let _devConfig = null;

async function getLkSdk() {
  if (!_lkSdk) _lkSdk = await import('livekit-server-sdk');
  return _lkSdk;
}

function detectArch() {
  const arch = process.arch;
  if (arch === 'arm64' || arch === 'aarch64') return 'arm64';
  if (arch === 'x64') return 'amd64';
  return arch;
}

async function downloadBinary() {
  const version = '1.9.11';
  const arch = detectArch();
  const url = `https://github.com/livekit/livekit/releases/download/v${version}/livekit_${version}_linux_${arch}.tar.gz`;

  logger.info(`[LiveKit] Downloading livekit-server v${version} for ${arch}...`);
  mkdirSync(BIN_DIR, { recursive: true });

  const tmpTar = join(BIN_DIR, 'livekit.tar.gz');

  await new Promise((resolve, reject) => {
    const follow = (u) => {
      get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        const ws = createWriteStream(tmpTar);
        res.pipe(ws);
        ws.on('finish', () => { ws.close(); resolve(); });
        ws.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });

  execSync(`tar xzf ${tmpTar} -C ${BIN_DIR}`, { stdio: 'pipe' });
  execSync(`rm -f ${tmpTar}`, { stdio: 'pipe' });
  execSync(`chmod +x ${BINARY_PATH}`, { stdio: 'pipe' });
  logger.info('[LiveKit] Binary downloaded successfully');
}

function generateDevConfig() {
  const apiKey = 'API' + randomBytes(8).toString('hex');
  const apiSecret = randomBytes(24).toString('base64url');

  const yaml = [
    'port: 7882',
    'rtc:',
    '  port_range_start: 50000',
    '  port_range_end: 50200',
    '  use_external_ip: false',
    '  tcp_port: 7883',
    'keys:',
    `  ${apiKey}: ${apiSecret}`,
    'logging:',
    '  level: info',
  ].join('\n') + '\n';

  writeFileSync(CONFIG_PATH, yaml);
  logger.info('[LiveKit] Generated dev config at livekit.yaml');
  return { apiKey, apiSecret };
}

async function isLivekitRunning() {
  try {
    const res = await fetch('http://127.0.0.1:7882');
    return res.ok;
  } catch {
    return false;
  }
}

let _stopping = false;
let _restartCount = 0;
const MAX_RESTARTS = 10;
const RESTART_DELAY = 2000;

function spawnLivekit() {
  const child = spawn(BINARY_PATH, ['--config', CONFIG_PATH, '--bind', '127.0.0.1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (d) => {
    const line = d.toString().trim();
    if (line) logger.info('[LiveKit-srv] ' + line);
  });

  child.stderr.on('data', (d) => {
    const line = d.toString().trim();
    if (line) logger.info('[LiveKit-srv] ' + line);
  });

  child.on('exit', (code) => {
    logger.info(`[LiveKit] Server exited with code ${code}`);
    _childProcess = null;
    if (!_stopping && _restartCount < MAX_RESTARTS) {
      _restartCount++;
      logger.info(`[LiveKit] Restarting (attempt ${_restartCount}/${MAX_RESTARTS})...`);
      setTimeout(() => {
        if (!_stopping) {
          _childProcess = spawnLivekit();
        }
      }, RESTART_DELAY);
    }
  });

  return child;
}

async function startLivekitServer() {
  if (await isLivekitRunning()) {
    logger.info('[LiveKit] Server already running on 127.0.0.1:7882');
    return;
  }

  if (!existsSync(BINARY_PATH)) {
    await downloadBinary();
  }

  if (!existsSync(CONFIG_PATH)) {
    generateDevConfig();
  }

  logger.info('[LiveKit] Starting livekit-server...');
  _stopping = false;
  _restartCount = 0;
  _childProcess = spawnLivekit();

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await isLivekitRunning()) {
      logger.info('[LiveKit] Server ready on 127.0.0.1:7882');
      return;
    }
  }
  throw new Error('LiveKit server failed to start within 15s');
}

function stopLivekitServer() {
  _stopping = true;
  if (_childProcess) {
    _childProcess.kill('SIGTERM');
    _childProcess = null;
  }
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
      if (match) {
        _devConfig = { apiKey: match[1], apiSecret: match[2] };
      }
    }
    if (!_devConfig) {
      _devConfig = generateDevConfig();
    }
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
  const servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (cfg.turnUrl && cfg.turnUsername && cfg.turnCredential) {
    servers.push({ urls: [cfg.turnUrl], username: cfg.turnUsername, credential: cfg.turnCredential });
  }
  return servers;
}

async function initialize() {
  const cfg = getConfig();
  if (!process.env.LIVEKIT_URL) {
    await startLivekitServer();
  }
  logger.info(`[LiveKit] Config: url=${cfg.url} apiKey=${cfg.apiKey}`);
}

export {
  getLkSdk,
  getConfig,
  buildIceServers,
  initialize as initializeLiveKit,
  stopLivekitServer,
};
