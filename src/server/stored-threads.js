import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { tr } from './i18n.js';
const exec = promisify(execFile);

// Read-only navigation index, including empty and attached threads hidden by thread/list.
export async function readStoredThreads({ home = process.env.CODEX_HOME || join(homedir(), '.codex'), run = exec } = {}) {
  const files = (await readdir(home)).filter(name => /^state_\d+\.sqlite$/.test(name));
  if (files.length !== 1 || files[0] !== 'state_5.sqlite') throw Error(tr('cleanupIndexUnknown'));
  const { stdout } = await run('sqlite3', ['-readonly', '-json', join(home, files[0]),
    'SELECT id, cwd, name, updated_at AS updatedAt, archived FROM threads;'], { timeout: 10000, maxBuffer: 16 * 1024 * 1024 });
  const threads = JSON.parse(stdout || '[]');
  if (!Array.isArray(threads) || threads.some(t => typeof t.id !== 'string' || typeof t.cwd !== 'string' || !t.cwd.startsWith('/') || ![0, 1].includes(t.archived))) throw Error(tr('cleanupIndexUnknown'));
  return threads.map(t => ({ ...t, archived: t.archived === 1 }));
}
