import { createI18n } from './i18n.js';
export function normalizePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\0')) return null;
  const parts = [];
  for (const p of value.split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') parts.pop(); else parts.push(p);
  }
  return `/${parts.join('/')}`.normalize('NFC');
}

export function containsPath(root, cwd) {
  return root === cwd || (root === '/' ? cwd?.startsWith('/') : cwd?.startsWith(`${root}/`));
}

export function worktreeLabel(w, tr = createI18n().t) {
  return w.headRef?.type === 'branch' ? w.headRef.string : `detached HEAD · ${w.headRef?.sha?.slice(0, 7) || tr('unknown')}`;
}

export function threadLink(id, tr = createI18n().t) {
  if (typeof id !== 'string' || !id) throw Error(tr('missingId'));
  return `codex://threads/${encodeURIComponent(id)}`;
}

export async function paginate(request, params, { signal, tr = createI18n().t } = {}) {
  let cursor = null;
  const cursors = new Set();
  const threads = new Map();
  do {
    signal?.throwIfAborted();
    const page = await request({ ...params, cursor });
    if (!page || !Array.isArray(page.data) || (page.nextCursor != null && typeof page.nextCursor !== 'string')) throw Error(tr('invalidThreads'));
    for (const t of page.data) {
      if (!t || typeof t.id !== 'string' || typeof t.cwd !== 'string') throw Error(tr('invalidThread'));
      threads.set(t.id, t);
    }
    cursor = page.nextCursor;
    if (cursor != null && cursors.has(cursor)) throw Error(tr('threadCursor'));
    if (cursor != null) cursors.add(cursor);
  } while (cursor != null);
  return [...threads.values()];
}

export async function mapLimit(items, limit, fn) {
  let index = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) { const i = index++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

// Only verified, existing linked worktrees enter the display model.
export function buildTree({ projects, repositories, threads, metadata }) {
  const repos = repositories.map(r => ({ ...r, worktrees: r.worktrees
    .filter(w => w.exists === true && !w.prunable && normalizePath(w.root) !== normalizePath(r.mainRoot))
    .map(w => ({ ...w, threads: [] })) })).filter(r => r.worktrees.length > 0);
  const repoById = new Map(repos.map(r => [normalizePath(r.commonDir), r]));
  const all = repos.flatMap(r => r.worktrees.map(w => ({ repo: r, w })));
  const seen = new Set();
  for (const t of threads) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    const cwd = normalizePath(t.cwd);
    const m = metadata.get(cwd);
    const realRoot = normalizePath(m?.root);
    const repo = repoById.get(normalizePath(m?.commonDir));
    let target = repo?.worktrees.find(w => normalizePath(w.root) === realRoot);
    // Longest match prevents a nested worktree's sessions being assigned to its parent.
    if (!target && !metadata.has(cwd)) target = all.filter(({ w }) => containsPath(normalizePath(w.root), cwd))
      .sort((a, b) => b.w.root.length - a.w.root.length)[0]?.w;
    if (target) target.threads.push(t);
  }
  for (const r of repos) {
    const project = projects.find(p => normalizePath(p.path) === normalizePath(r.mainRoot))
      || projects.find(p => r.worktrees.some(w => containsPath(normalizePath(w.root), normalizePath(p.path))));
    r.name = project?.name || r.root.split('/').filter(Boolean).at(-1) || r.root;
    r.worktrees.sort((a, b) => worktreeLabel(a).localeCompare(worktreeLabel(b)) || a.root.localeCompare(b.root));
    for (const w of r.worktrees) w.threads.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.id.localeCompare(b.id));
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name) || a.commonDir.localeCompare(b.commonDir));
}
