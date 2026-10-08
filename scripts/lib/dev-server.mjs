import { spawn } from 'node:child_process';
import path from 'node:path';

export function startDevServer({ port, local }) {
  const server = spawn(process.execPath, [path.resolve('scripts/dev-server.mjs'), 'docs', String(port)], {
    env: { ...process.env, ZELLOUS_LOCAL_DEPS: local ? '1' : '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  const stop = (code) => {
    server.kill('SIGKILL');
    process.exit(code);
  };
  async function up() {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    console.error('dev server never came up:\n' + log);
    stop(1);
  }
  return { up, stop };
}
