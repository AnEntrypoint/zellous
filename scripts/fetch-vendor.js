#!/usr/bin/env node
/**
 * Fetch vendor files during CI/build.
 * Downloads: rnnoise, fonts
 * Run: node scripts/fetch-vendor.js
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.join(__dirname, '..', 'docs', 'vendor');

const files = [
  {
    name: 'rnnoise-sync.js',
    url: 'https://cdn.jsdelivr.net/npm/@jitsi/rnnoise-wasm@0.2.2/dist/rnnoise-processor.js',
    optional: true,
  },
  {
    name: 'rnnoise-worklet.js',
    url: 'https://cdn.jsdelivr.net/npm/@jitsi/rnnoise-wasm@0.2.2/dist/rnnoise-worklet.js',
    optional: true,
  },
  {
    name: 'fonts/noto-sans-400.ttf',
    url: 'https://fonts.gstatic.com/s/notosans/v21/o-0NIpQlx3QUlC5A4PNr6DRHS_m8rYnrF_BOXe5dZ3E.ttf',
  },
  {
    name: 'fonts/noto-sans-500.ttf',
    url: 'https://fonts.gstatic.com/s/notosans/v21/o-0OIpQlx3QUlC5A4PNr6DRHS_m8rYnrF_BOXe5dZ3E.ttf',
  },
  {
    name: 'fonts/noto-sans-600.ttf',
    url: 'https://fonts.gstatic.com/s/notosans/v21/o-0TIpQlx3QUlC5A4PNr6DRHS_m8rYnrF_BOXe5dZ3E.ttf',
  },
  {
    name: 'fonts/noto-sans-700.ttf',
    url: 'https://fonts.gstatic.com/s/notosans/v21/o-0VIpQlx3QUlC5A4PNr6DRHS_m8rYnrF_BOXe5dZ3E.ttf',
  },
];

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching vendor files...');
  for (const file of files) {
    const dest = path.join(vendorDir, file.name);
    try {
      console.log(`  ${file.name}...`);
      await downloadFile(file.url, dest);
    } catch (err) {
      if (file.optional) {
        console.warn(`  ⊘ ${file.name}: ${err.message} (optional, skipping)`);
      } else {
        console.error(`  ✗ ${file.name}: ${err.message}`);
        process.exit(1);
      }
    }
  }
  console.log('✓ All vendor files fetched');
}

main();
