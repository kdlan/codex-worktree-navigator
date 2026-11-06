import { withDesktopTools } from './server/desktop.js';
import { createGit, localGitQuery } from './server/git.js';
import { discoverSnapshot } from './host.js';
import { buildTree } from './model.js';
import { tr } from './server/i18n.js';

export function createDesktopHost({ connect = withDesktopTools, connectionOptions = {}, git = createGit(localGitQuery) } = {}) {
  const metadataCache = new Map();
  return {
    async createSession() { throw Error(tr('desktopCreationUnavailable')); },
    async cleanupWorktree() { throw Error(tr('desktopCleanupUnavailable')); },
    async snapshot(signal, { force = false } = {}) {
      if (force) metadataCache.clear();
      return connect(async call => {
        const catalog = await call('list_projects', {});
        if (!Array.isArray(catalog?.projects)) throw Error(tr('invalidProjects'));
        const local = catalog.projects.filter(p => p.projectKind === 'local' && p.hostId === 'local');
        if (local.some(p => typeof p.path !== 'string' || !p.path.startsWith('/'))) throw Error(tr('invalidProject'));
        const projects = local.map(p => ({ path: p.path, name: p.label }));
        const rpc = async (method, params) => {
          if (method !== 'thread/list') throw Error(tr('unsupportedOperation'));
          const page = await call('list_threads', {
            mode: 'history', source: 'codex', hostId: 'local', limit: 50,
            archived: params.archived === true, ...(params.cursor == null ? {} : { cursor: params.cursor }),
          });
          if (!Array.isArray(page?.threads) || page.threads.some(t => t.kind !== 'codex' || t.hostId !== 'local')) throw Error(tr('invalidThreads'));
          return { data: page.threads.map(t => ({ id: t.id, cwd: t.cwd, name: t.title, updatedAt: t.updatedAt, status: t.status })), nextCursor: page.nextCursor };
        };
        const snapshot = await discoverSnapshot({ projects: async () => projects, git, rpc, signal, metadataCache });
        return {
          repositories: buildTree(snapshot), errors: snapshot.errors,
          capabilities: { createSession: false, cleanupWorktree: false },
        };
      }, { ...connectionOptions, signal });
    },
  };
}
