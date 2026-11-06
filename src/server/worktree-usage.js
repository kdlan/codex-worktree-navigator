import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath } from 'node:fs/promises';
import { containsPath, normalizePath } from '../model.js';
import { readStoredThreads } from './stored-threads.js';
import { tr } from './i18n.js';
const exec = promisify(execFile);

export async function assertNoOpenFiles(cwd, run = exec) {
  let result;
  try {
    result = await run('lsof', ['-n', '-P', '-F', 'pn', '+D', cwd], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  } catch (error) {
    // lsof uses exit status 1 when it finds no matching open files.
    if (error.code === 1 && error.stdout?.trim()) throw Error(tr('cleanupInUse'));
    if (error.code === 1 && !error.stdout?.trim() && !error.stderr?.trim()) return;
    throw Error(tr('cleanupUsageUnknown'));
  }
  if (result.stderr?.trim()) throw Error(tr('cleanupUsageUnknown'));
  if (result.stdout?.trim()) throw Error(tr('cleanupInUse'));
}

export async function assertWorktreeUnused(rpc, cwd, { checkOpenFiles = assertNoOpenFiles, canonicalize = realpath, readThreads = readStoredThreads } = {}) {
  // Stored, unarchived chats protect the directory regardless of their runtime status.
  const threads = (await readThreads()).filter(t => !t.archived);
  for (const thread of threads) {
    let path = normalizePath(thread.cwd);
    try { path = normalizePath(await canonicalize(thread.cwd)); }
    catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
    if (containsPath(cwd, path)) throw Error(tr('cleanupUnarchived'));
  }
  await checkOpenFiles(cwd);
}
