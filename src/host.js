import { cleanWorktree } from './server/cleanup.js';
import { tr } from './server/i18n.js';
import { listNativeProjects, projectOptions, createWorktreeSession } from './server/sessions.js';
import { readFile, realpath } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { normalizePath, containsPath, paginate, mapLimit, buildTree } from './model.js';
import { withAppServer } from './server/app-server.js';
import { createGit } from './server/git.js';

export async function readProjects(codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')) {
  const state = JSON.parse(await readFile(join(codexHome, '.codex-global-state.json'), 'utf8'));
  const projects = new Map();
  for (const path of state['electron-saved-workspace-roots'] || []) if (normalizePath(path)) projects.set(path, { path, name: basename(path) });
  for (const p of Object.values(state['local-projects'] || {})) for (const path of p.rootPaths || []) if (normalizePath(path)) projects.set(path, { path, name: p.name || basename(path) });
  return [...projects.values()];
}

export async function discoverSnapshot({ projects, git, rpc, signal, metadataCache = new Map() }) {
  const knownProjects = await projects();
  const meta = new Map(), errors = [], repositories = new Map();
  async function metadata(cwd, fresh = false) {
    const path = normalizePath(cwd); if (!path) return null;
    const cached = metadataCache.get(path);
    if (!fresh && cached && Date.now() - cached.at < 120000) return cached.value;
    const value = await git.metadata(path);
    if (value && (!normalizePath(value.root) || !normalizePath(value.commonDir))) throw Error(tr('invalidGit'));
    metadataCache.set(path, { at: Date.now(), value });
    if (metadataCache.size > 2048) metadataCache.delete(metadataCache.keys().next().value);
    return value;
  }
  // Known projects provide candidates; history never adds repositories.
  await mapLimit(knownProjects, 4, async p => {
    signal?.throwIfAborted();
    try { const m = await metadata(p.path, true); if (m) repositories.set(normalizePath(m.commonDir), { ...m, worktrees: [] }); }
    catch (e) { signal?.throwIfAborted(); errors.push(p.path + ': ' + e.message); }
  });
  await mapLimit([...repositories.values()], 4, async r => {
    try {
      const listed = await git.worktrees(r.root);
      if (!Array.isArray(listed)) throw Error(tr('invalidWorktreeResponse'));
      const [primary, ...linked] = listed;
      r.mainRoot = normalizePath(primary?.root);
      if (!r.mainRoot) return;
      const main = await metadata(r.mainRoot, true);
      r.mainRoot = normalizePath(main?.root) || r.mainRoot; r.root = r.mainRoot;
      const verified = await mapLimit(linked.filter(w => !w.prunable && !w.bare), 2, async w => {
        try {
          const m = await metadata(w.root, true);
          if (!m || normalizePath(m.commonDir) !== normalizePath(r.commonDir)) return null;
          const status = await git.status(m.root);
          if (status?.type !== 'success') return null;
          meta.set(normalizePath(w.root), m);
          return { ...w, root: normalizePath(m.root), registeredRoot: w.root, exists: true, sourceBranch: null, status };
        } catch (e) { signal?.throwIfAborted(); errors.push(w.root + ': ' + e.message); return null; }
      });
      r.worktrees = [...new Map(verified.filter(Boolean).map(w => [w.root, w])).values()];
    } catch (e) { signal?.throwIfAborted(); r.worktrees = []; errors.push(r.root + ': ' + e.message); }
  });
  const visible = [...repositories.values()].filter(r => r.worktrees.length > 0);
  if (!visible.length) return { projects: knownProjects, repositories: [], threads: [], metadata: meta, errors };
  const params = { limit: 100, sortKey: 'updated_at', modelProviders: null, sourceKinds: ['cli', 'vscode', 'appServer', 'unknown'], useStateDbOnly: true };
  const live = await paginate(p => rpc('thread/list', p), { ...params, archived: false }, { signal, tr });
  const archived = await paginate(p => rpc('thread/list', p), { ...params, archived: true }, { signal, tr });
  const threads = [...new Map([...archived.map(t => ({ ...t, archived: true })), ...live].map(t => [t.id, t])).values()];
  const roots = visible.flatMap(r => r.worktrees.map(w => w.root));
  await mapLimit([...new Set(threads.map(t => normalizePath(t.cwd)).filter(Boolean))], 4, async path => {
    signal?.throwIfAborted();
    try {
      let canonical;
      try { canonical = await realpath(path); } catch (e) { if (!['ENOENT', 'ENOTDIR'].includes(e.code)) throw e; }
      if (!roots.some(root => containsPath(root, normalizePath(canonical) || path))) { meta.set(path, null); return; }
      meta.set(path, await metadata(path));
    } catch (e) { signal?.throwIfAborted(); meta.set(path, null); errors.push(path + ': ' + e.message); }
  });
  return { projects: knownProjects, repositories: visible, threads, metadata: meta, errors };
}

export function createHost({ projects = readProjects, connect = withAppServer, connectionOptions = {} } = {}) {
  const metadataCache = new Map();
  const creations = new Map();
  const cleanups = new Map();
  return {
    async cleanupWorktree(args) {
      if (!args || typeof args.requestId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(args.requestId) || args.confirmed !== true || !normalizePath(args.worktreePath)) throw Error(tr('cleanupInvalid'));
      const signature = JSON.stringify({worktreePath:args.worktreePath,confirmed:args.confirmed});
      const old = cleanups.get(args.requestId);
      if (old) { if (old.signature !== signature) throw Error(tr('reusedRequest')); return old.promise; }
      if (cleanups.size >= 500) throw Error(tr('cleanupLimit'));
      const promise = connect(rpc => cleanWorktree({...args,projects,git:createGit(rpc),rpc}),connectionOptions).then(result=>{metadataCache.clear();return result;});
      cleanups.set(args.requestId,{signature,promise});
      return promise;
    },
    async createSession({ worktreePath, projectId, text = '', requestId }) {
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId) || typeof text !== 'string' || text.length > 32000) throw Error(tr('invalidCreation'));
      const signature = JSON.stringify({worktreePath, projectId, text});
      if (creations.has(requestId)) {
        const old = creations.get(requestId);
        if (old.signature !== signature) throw Error(tr('reusedRequest'));
        return old.promise;
      }
      // Keep failed requests too: retry must not duplicate a message or a partially created thread.
      if (creations.size >= 500) throw Error(tr('creationLimit'));
      const promise = (async () => {
        const result = await connect(rpc => createWorktreeSession({rpc, git: createGit(rpc), projectId, worktreePath, text, requestId}), connectionOptions);
        return result;
      })();
      creations.set(requestId, {signature, promise});
      return promise;
    },
    async snapshot(signal, { force = false } = {}) {
      if (force) metadataCache.clear();
      return connect(async rpc => {
        const snapshot = await discoverSnapshot({ projects, git: createGit(rpc), rpc, signal, metadataCache });
        const tree = buildTree(snapshot);
        try {
          const nativeProjects = await listNativeProjects(rpc);
          const ownership = new Map();
          await mapLimit([...new Set(nativeProjects.flatMap(p => p.roots.map(r => r.path)))], 4, async path => {
            try { ownership.set(normalizePath(path), metadataCache.get(normalizePath(path))?.value ?? await createGit(rpc).metadata(path)); }
            catch { ownership.set(normalizePath(path), null); }
          });
          for (const r of tree) r.projectOptions = projectOptions(r, nativeProjects, ownership);
        } catch (e) {
          snapshot.errors.push(tr('projectReadFailed', {detail: e.message}));
          for (const r of tree) r.projectOptions = [];
        }
        // The UI receives only navigation metadata, never turns or credentials.
        for (const r of tree) for (const w of r.worktrees) w.threads = w.threads.map(t => ({ id: t.id, cwd: t.cwd, name: t.name, preview: t.preview, updatedAt: t.updatedAt, archived: t.archived === true }));
        return { repositories: tree, errors: snapshot.errors };
      }, { ...connectionOptions, signal });
    },
  };
}
