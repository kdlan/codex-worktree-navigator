import { realpath } from 'node:fs/promises';
import { normalizePath, containsPath } from '../model.js';
import { tr } from './i18n.js';

export async function cleanWorktree({ worktreePath, confirmed, projects, git, rpc }) {
  if (confirmed !== true || !normalizePath(worktreePath)) throw Error(tr('cleanupInvalid'));
  const cwd = await realpath(worktreePath);
  const metadata = await git.metadata(cwd);
  if (!metadata || metadata.bare || metadata.root !== cwd) throw Error(tr('invalidWorktree'));
  // Only repositories discovered through saved Codex projects are eligible.
  let known = false;
  for (const project of await projects()) {
    const candidate = await git.metadata(project.path);
    if (candidate?.commonDir === metadata.commonDir) { known = true; break; }
  }
  if (!known) throw Error(tr('cleanupUnknown'));
  const listed = await git.worktrees(cwd);
  const main = listed[0];
  const target = listed.slice(1).find(w => normalizePath(w.root) === normalizePath(cwd));
  if (!main || !target || target.bare || target.prunable || target.locked) throw Error(tr('cleanupProtected'));
  const mainRoot = await realpath(main.root);
  if (mainRoot === cwd) throw Error(tr('cleanupProtected'));
  // Loaded sessions are checked conservatively, including their subdirectories.
  let cursor = null; const cursors = new Set();
  do {
    const page = await rpc('thread/loaded/list', {cursor, limit:100});
    if (!Array.isArray(page?.data) || page.data.some(id=>typeof id !== 'string') || (page.nextCursor != null && typeof page.nextCursor !== 'string')) throw Error(tr('cleanupSessionsUnknown'));
    for (const threadId of page.data) {
      const {thread} = await rpc('thread/read', {threadId, includeTurns:false});
      if (!normalizePath(thread?.cwd)) throw Error(tr('cleanupSessionsUnknown'));
      let path;
      try { path = await realpath(thread.cwd); } catch (e) { if (!['ENOENT','ENOTDIR'].includes(e.code)) throw e; path = normalizePath(thread.cwd); }
      if (containsPath(cwd,path)) throw Error(tr('cleanupLoaded'));
    }
    cursor = page.nextCursor;
    if (cursor != null && cursors.has(cursor)) throw Error(tr('cleanupSessionsUnknown'));
    cursors.add(cursor);
  } while (cursor != null);
  await git.removeCleanWorktree(mainRoot, cwd);
  return {removed:true, worktreePath:cwd};
}
