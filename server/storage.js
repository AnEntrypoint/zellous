import { promises as fs } from 'fs';
import { join } from 'path';
import { DATA_ROOT, initStorage, startCleanupProcessor, stopCleanupProcessor } from './storage-utils.js';
import { users } from './storage-users.js';
import { sessions } from './storage-sessions.js';
import { rooms } from './storage-rooms.js';
import { messages } from './storage-messages.js';
import { media } from './storage-media.js';
import { files } from './storage-files.js';
import logger from '@sequential/sequential-logging';
import { nowISO, createTimestamps, updateTimestamp } from '@sequential/timestamp-utilities';

async function cleanupOnStartup() {
  logger.info('[Storage] Running startup cleanup...');

  const cleanupPath = join(DATA_ROOT, 'cleanup.json');
  try {
    const cleanup = JSON.parse(await fs.readFile(cleanupPath, 'utf8'));
    for (const [roomId] of Object.entries(cleanup)) {
      await rooms.cleanup(roomId);
    }
    await fs.writeFile(cleanupPath, '{}');
  } catch (e) {
    logger.error(`[Storage] Failed to cleanup.json read in cleanupOnStartup: ${e.message}`);
  }

  const sessionsDir = join(DATA_ROOT, 'sessions');
  try {
    const files = await fs.readdir(sessionsDir);
    const now = Date.now();
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const session = JSON.parse(await fs.readFile(join(sessionsDir, file), 'utf8'));
          if (session.expiresAt < now) {
            await fs.unlink(join(sessionsDir, file));
            logger.info(`[Storage] Cleaned expired session: ${session.id}`);
          }
        } catch (e) {
          logger.error(`[Storage] Failed to sessions read in cleanupOnStartup: ${e.message}`);
        }
      }
    }
  } catch {}

  logger.info('[Storage] Startup cleanup complete');
}

async function initialize() {
  await initStorage();
  await cleanupOnStartup();
}

function startCleanup() {
  startCleanupProcessor(() => rooms.processCleanups());
}

function stopCleanup() {
  stopCleanupProcessor();
}

export {
  initialize,
  startCleanup,
  stopCleanup,
  users,
  sessions,
  rooms,
  messages,
  media,
  files,
  DATA_ROOT
};
