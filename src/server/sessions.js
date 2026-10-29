import { tr } from './i18n.js';
import { realpath } from 'node:fs/promises';
import { normalizePath } from '../model.js';

export async function listNativeProjects(rpc) {
  const projects = new Map(), cursors = new Set(); let cursor = null;
  do {
    const page = await rpc('project/list', { limit: 100, cursor });
    if (!Array.isArray(page?.data) || (page.nextCursor != null && typeof page.nextCursor !== 'string')) throw Error(tr('invalidProjects'));
    for (const p of page.data) {
      if (typeof p.id !== 'string' || !Array.isArray(p.roots) || p.roots.some(r => !normalizePath(r.path))) throw Error(tr('invalidProject'));
      projects.set(p.id, { id: p.id, name: p.name || p.id, roots: p.roots.map(r => ({ path: r.path })) });
    }
    cursor = page.nextCursor;
    if (cursor != null && cursors.has(cursor)) throw Error(tr('projectCursor'));
    if (cursor != null) cursors.add(cursor);
  } while (cursor != null);
  return [...projects.values()];
}

export function projectOptions(repo, projects, metadata) {
  // Only projects anchored in the primary checkout own this repository.
  // A separate project previously imported from a linked checkout is not the owner.
  return projects.filter(p => p.roots.some(({ path }) => {
    const m = metadata.get(normalizePath(path));
    return normalizePath(m?.commonDir) === normalizePath(repo.commonDir) && normalizePath(m?.root) === normalizePath(repo.mainRoot);
  })).map(p => ({ id: p.id, name: p.name }));
}

export async function requireExistingTrust(rpc, cwd, mainRoot, canonicalize = realpath) {
  const response = await rpc('config/read', { cwd, includeLayers: true });
  if (!Array.isArray(response?.layers)) throw Error(tr('unknownTrust'));
  const entries = new Map();
  // App Server returns high-priority layers first. Project-local config cannot grant itself trust.
  for (const layer of response.layers.toReversed()) {
    if (layer.name?.type === 'project' || layer.disabledReason != null) continue;
    for (const [path, value] of Object.entries(layer.config?.projects || {})) {
      if (['trusted', 'untrusted'].includes(value?.trust_level)) entries.set(path, value.trust_level);
    }
  }
  const canonical = new Map();
  for (const [path, level] of entries) {
    if (!normalizePath(path)) continue;
    let key;
    try { key = normalizePath(await canonicalize(path)); }
    catch (e) { if (['ENOENT', 'ENOTDIR'].includes(e.code)) continue; throw e; }
    // Conflicting aliases are treated conservatively.
    if (canonical.get(key) !== 'untrusted') canonical.set(key, level);
  }
  const level = canonical.get(normalizePath(cwd)) ?? canonical.get(normalizePath(mainRoot));
  if (level !== 'trusted') throw Error(level === 'untrusted' ? tr('untrusted') : tr('noTrust'));
}

export async function createWorktreeSession({ rpc, git, projectId, worktreePath, signal, text = '', requestId, canonicalize = realpath }) {
  if (typeof projectId !== 'string' || !projectId || !normalizePath(worktreePath)) throw Error(tr('invalidSelection'));
  signal?.throwIfAborted();
  const cwd = normalizePath(await canonicalize(worktreePath));
  const m = await git.metadata(cwd);
  if (!m || normalizePath(m.root) !== cwd) throw Error(tr('invalidWorktree'));
  const listed = await git.worktrees(cwd);
  const mainRoot = listed[0] && normalizePath(await canonicalize(listed[0].root));
  const linked = listed.slice(1).find(w => !w.prunable && !w.bare && normalizePath(w.root) === cwd);
  if (!mainRoot || !linked) throw Error(tr('worktreeRemoved'));
  const result = await rpc('project/read', { projectId });
  const project = result?.project;
  if (project?.id !== projectId || !Array.isArray(project.roots)) throw Error(tr('projectRemoved'));
  let ownsRepository = false;
  for (const root of project.roots) {
    const source = await git.metadata(root.path);
    if (source && normalizePath(source.root) === mainRoot && normalizePath(source.commonDir) === normalizePath(m.commonDir)) ownsRepository = true;
  }
  if (!ownsRepository) throw Error(tr('wrongProject'));
  await requireExistingTrust(rpc, cwd, mainRoot, canonicalize);
  signal?.throwIfAborted();
  const started = await rpc('thread/start', { projectId, cwd, ephemeral: false, historyMode: 'paginated', sandbox: 'read-only', approvalPolicy: 'on-request' });
  const thread = started?.thread;
  if (!thread?.id) throw Error(tr('missingThread'));
  const threadId = thread.id;
  try {
    if (thread.projectId !== projectId || normalizePath(thread.cwd) !== cwd) throw Error(tr('wrongThread'));
    await rpc('thread/name/set', { threadId, name: tr('defaultSessionName') });
    await rpc('thread/settings/update', { threadId, sandboxPolicy: { type: 'readOnly' }, approvalPolicy: 'on-request' });
    await rpc('thread/archive', { threadId });
    const restored = await rpc('thread/unarchive', { threadId });
    if (restored.thread?.projectId !== projectId || normalizePath(restored.thread?.cwd) !== cwd) throw Error(tr('restoreMismatch'));
    const loaded = await rpc('thread/loaded/list', {});
    if (!Array.isArray(loaded.data) || loaded.data.includes(threadId)) throw Error(tr('writerNotReleased'));
    if (text.trim()) await rpc('thread/queue/add', { threadId, clientUserMessageId: requestId, input: [{type: 'text', text, text_elements: []}] });
    return { threadId, projectId, cwd };
  } catch (error) {
    throw Error(tr('partialCreation', {threadId, detail: error.message}));
  }
}
