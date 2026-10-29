import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execGit = promisify(execFile);
import { tr } from './i18n.js';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

export function parseWorktrees(text) {
  const worktrees = []; let record;
  for (const field of text.split('\0')) {
    if (!field) { if (record) worktrees.push(record); record = undefined; continue; }
    const space = field.indexOf(' '), key = space < 0 ? field : field.slice(0, space), value = space < 0 ? '' : field.slice(space + 1);
    if (key === 'worktree') record = { root: value, headRef: { type: 'detached', sha: '' } };
    else if (record && key === 'HEAD') record.headRef.sha = value;
    else if (record && key === 'branch') record.headRef = { ...record.headRef, type: 'branch', string: value.replace(/^refs\/heads\//, '') };
    else if (record && key === 'bare') record.bare = true;
    else if (record && key === 'prunable') record.prunable = value || true;
    else if (record && key === 'locked') record.locked = value || true;
  }
  if (record) worktrees.push(record);
  return worktrees;
}

export function createGit(request) {
  async function query(cwd, args) {
    const result = await request('command/exec', { command: ['git', '-C', cwd, ...args], cwd, sandboxPolicy: { type: 'readOnly', networkAccess: false }, timeoutMs: 10000, outputBytesCap: 4 * 1024 * 1024, env: { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } });
    if (result.exitCode !== 0) throw Error(result.stderr?.trim() || tr('gitFailed', {code: result.exitCode}));
    return result.stdout;
  }
  async function metadata(cwd) {
    let path;
    try { path = await realpath(cwd); if (!(await stat(path)).isDirectory()) return null; }
    catch (e) { if (['ENOENT', 'ENOTDIR'].includes(e.code)) return null; throw e; }
    let info;
    try { info = (await query(path, ['rev-parse', '--is-bare-repository', '--path-format=absolute', '--git-common-dir'])).replace(/\n$/, '').split('\n'); }
    catch (e) { if (/not a git repository/i.test(e.message)) return null; throw e; }
    const bare = info[0] === 'true';
    const commonDir = await realpath(resolve(path, info.slice(1).join('\n')));
    const root = bare ? path : await realpath((await query(path, ['rev-parse', '--show-toplevel'])).replace(/\n$/, ''));
    if (!isAbsolute(root) || !isAbsolute(commonDir)) throw Error(tr('invalidGit'));
    return { root, commonDir, bare };
  }
  return {
    metadata,
    async worktrees(cwd) { return parseWorktrees(await query(cwd, ['worktree', 'list', '--porcelain', '-z'])); },
    async removeCleanWorktree(mainRoot, cwd) {
      const dirty = await query(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored']);
      if (dirty) throw Error(tr('cleanupDirty'));
      // Preserve detached commits through a local branch before removing their checkout.
      if (!(await query(cwd, ['for-each-ref', '--contains=HEAD', '--format=%(refname)', 'refs/heads/'])).trim()) throw Error(tr('cleanupDetached'));
      // Removal is a fixed local operation; argv is never interpreted by a shell.
      try {
        await execGit('git', ['-C',mainRoot,'worktree','remove','--',cwd], {
          cwd:mainRoot,timeout:10000,maxBuffer:1024*1024,
          env:{...process.env,GIT_TERMINAL_PROMPT:'0'},
        });
      } catch(e) { throw Error(e.stderr?.trim() || e.message); }
    },
    async status(cwd) {
      const text = await query(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=no']);
      let stagedCount = 0, unstagedCount = 0;
      const records = text.split('\0');
      for (let i = 0; i < records.length; i++) { const r = records[i]; if (!r) continue; if (r[0] !== ' ') stagedCount++; if (r[1] !== ' ') unstagedCount++; if (/[RC]/.test(r.slice(0, 2))) i++; }
      return { type: 'success', stagedCount, unstagedCount };
    },
  };
}
