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

let _childProcess = null;

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
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { follow(res.headers.location); return; }
        if (res.statusCode !== 200) { reject(new Error(`Download failed: HTTP ${res.statusCode}`)); return; }
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
    'port: 7882', 'rtc:', '  port_range_start: 50000', '  port_range_end: 50200',
    '  use_external_ip: true', '  tcp_port: 7883', 'keys:',
    `  ${apiKey}: ${apiSecret}`, 'logging:', '  level: info',
  ].join('\n') + '\n';
  writeFileSync(CONFIG_PATH, yaml);
  logger.info('[LiveKit] Generated dev config at livekit.yaml');
  return { apiKey, apiSecret };
}

function patchExistingConfig() {
  if (!existsSync(CONFIG_PATH)) return;
  const content = readFileSync(CONFIG_PATH, 'utf-8');
  if (content.includes('use_external_ip: false')) {
    writeFileSync(CONFIG_PATH, content.replace('use_external_ip: false', 'use_external_ip: true'));
    logger.info('[LiveKit] Patched livekit.yaml: use_external_ip set to true');
  }
}

async function isRunning() {
  try { const res = await fetch('http://127.0.0.1:7882'); return res.ok; } catch { return false; }
}

let _stopping = false;
let _restartCount = 0;

function spawnProcess() {
  const child = spawn(BINARY_PATH, ['--config', CONFIG_PATH, '--bind', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => { const line = d.toString().trim(); if (line) logger.info('[LiveKit-srv] ' + line); });
  child.stderr.on('data', (d) => { const line = d.toString().trim(); if (line) logger.info('[LiveKit-srv] ' + line); });
  child.on('exit', (code) => {
    logger.info(`[LiveKit] Server exited with code ${code}`);
    _childProcess = null;
    if (!_stopping && _restartCount < 10) {
      _restartCount++;
      logger.info(`[LiveKit] Restarting (attempt ${_restartCount}/10)...`);
      setTimeout(() => { if (!_stopping) { _childProcess = spawnProcess(); } }, 2000);
    }
  });
  return child;
}

async function start() {
  if (await isRunning()) { logger.info('[LiveKit] Server already running on 127.0.0.1:7882'); return; }
  if (!existsSync(BINARY_PATH)) await downloadBinary();
  if (!existsSync(CONFIG_PATH)) generateDevConfig();
  logger.info('[LiveKit] Starting livekit-server...');
  _stopping = false;
  _restartCount = 0;
  _childProcess = spawnProcess();
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await isRunning()) { logger.info('[LiveKit] Server ready on 127.0.0.1:7882'); return; }
  }
  throw new Error('LiveKit server failed to start within 15s');
}

function stop() {
  _stopping = true;
  if (_childProcess) { _childProcess.kill('SIGTERM'); _childProcess = null; }
}

export { CONFIG_PATH, generateDevConfig, patchExistingConfig, start, stop };
