import { withHistoryServer, withSessionServer } from './server/history-server.js';
import { createGit, localGitQuery } from './server/git.js';
import { listNativeProjects, projectOptions } from './server/sessions.js';
import { cleanWorktree } from './server/cleanup.js';
import { readStoredThreads } from './server/stored-threads.js';
import { assertWorktreeUnused } from './server/worktree-usage.js';
import { discoverSnapshot, createHost } from './host.js';
import { buildTree, normalizePath } from './model.js';
import { tr } from './server/i18n.js';

export function createHistoryHost({ connect = withHistoryServer, connectionOptions = {}, connectSession = withSessionServer, checkUsage = assertWorktreeUnused, readThreads = readStoredThreads, git = createGit(localGitQuery) } = {}) {
  const metadataCache = new Map();
  const sessionHost = createHost({ connect: work => connectSession(rpc => work(async (method, params) => method === 'command/exec' ? localGitQuery(method, params) : rpc(method, params)), connectionOptions) });
  const cleanups = new Map();
  let mutation = Promise.resolve();
  const serialize = work => { const result = mutation.then(work); mutation = result.catch(() => {}); return result; };
  return {
    createSession(args) { return serialize(() => sessionHost.createSession(args)); },
    async cleanupWorktree(args) {
      if (!args || args.confirmed !== true || !normalizePath(args.worktreePath) || typeof args.requestId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(args.requestId)) throw Error(tr('cleanupInvalid'));
      const signature = JSON.stringify({ worktreePath: args.worktreePath, confirmed: true });
      const old = cleanups.get(args.requestId);
      if (old) { if (old.signature !== signature) throw Error(tr('reusedRequest')); return old.promise; }
      if (cleanups.size >= 500) throw Error(tr('cleanupLimit'));
      const promise = serialize(() => connect(async rpc => {
        const projects = async () => (await listNativeProjects(rpc)).flatMap(p => p.roots);
        const result = await cleanWorktree({ ...args, projects, git, rpc, assertUnused: cwd => checkUsage(rpc, cwd, { readThreads }) });
        metadataCache.clear(); return result;
      }, connectionOptions));
      cleanups.set(args.requestId, { signature, promise }); return promise;
    },
    async snapshot(signal, { force = false } = {}) {
      if (force) metadataCache.clear();
      return connect(async rpc => {
        const nativeProjects = await listNativeProjects(rpc);
        const projects = nativeProjects.flatMap(p => p.roots.map(r => ({ path: r.path, name: p.name })));
        const stored = await readThreads();
        const snapshot = await discoverSnapshot({ projects: async () => projects, git, rpc: async (method, params) => {
          if (method !== 'thread/list') throw Error(tr('unsupportedOperation'));
          return { data: stored.filter(t => t.archived === (params.archived === true)), nextCursor: null };
        }, signal, metadataCache });
        const repositories = buildTree(snapshot);
        const ownership = new Map();
        for (const project of projects) {
          try { ownership.set(normalizePath(project.path), await git.metadata(project.path)); }
          catch { ownership.set(normalizePath(project.path), null); }
        }
        for (const repo of repositories) repo.projectOptions = projectOptions(repo, nativeProjects, ownership);
        for (const repo of repositories) for (const worktree of repo.worktrees) {
          worktree.threads = worktree.threads.map(t => ({ id: t.id, cwd: t.cwd, name: t.name, updatedAt: t.updatedAt, archived: t.archived === true }));
        }
        return { repositories, errors: snapshot.errors, capabilities: { createSession: true, cleanupWorktree: true } };
      }, { ...connectionOptions, signal });
    },
  };
}
