import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverSnapshot } from '../src/host.js';
import { buildTree } from '../src/model.js';
function fixture({ failGit = false, malformed = false } = {}) {
  let exists = true; const calls = [], cache = new Map();
  const git = {
    async metadata(path) { calls.push(['metadata', path]); if (failGit) throw Error('Git unavailable'); return path === '/extra' && !exists ? null : { root: path === '/extra/sub' ? '/extra' : path, commonDir: '/repo/.git' }; },
    async worktrees() { return [{ root: '/repo' }, { root: '/extra', headRef: { type: 'branch', string: 'feature' } }]; },
    async status() { calls.push(['status']); return { type: 'success' }; },
  };
  async function rpc(method, params) { calls.push([method, params]); return malformed ? null : { data: [{ id: params.archived ? 'archived' : 'live', cwd: '/extra', updatedAt: 1 }], nextCursor: null }; }
  return { calls, remove() { exists = false; }, snapshot: signal => discoverSnapshot({ projects: async () => [{ path: '/repo', name: 'Repo' }], git, rpc, signal, metadataCache: cache }) };
}
test('discover real worktrees before querying live and archived appServer history', async () => {
  const f = fixture(), s = await f.snapshot(); assert.equal(s.repositories.length, 1); assert.equal(s.threads.length, 2);
  const lists = f.calls.filter(x => x[0] === 'thread/list'); assert.deepEqual(lists.map(x => x[1].archived), [false, true]);
  assert.ok(lists.every(x => x[1].sourceKinds.includes('appServer')));
  assert.ok(f.calls.findIndex(x => x[0] === 'status') < f.calls.findIndex(x => x[0] === 'thread/list'));
  assert.equal(buildTree(s)[0].worktrees[0].threads.length, 2);
});
test('Git failure is explicit and history never creates repositories', async () => { const f = fixture({ failGit: true }), s = await f.snapshot(); assert.equal(s.repositories.length, 0); assert.equal(s.threads.length, 0); assert.match(s.errors[0], /Git unavailable/); });
test('malformed history fails the snapshot', async () => { await assert.rejects(fixture({ malformed: true }).snapshot(), /Invalid thread/); });
test('deleted worktrees disappear even when prior metadata was cached', async () => { const f = fixture(); assert.equal((await f.snapshot()).repositories.length, 1); f.remove(); const s = await f.snapshot(); assert.equal(s.repositories.length, 0); assert.equal(s.threads.length, 0); });
test('aborted snapshot stops discovery', async () => { const c = new AbortController(); c.abort(); await assert.rejects(fixture().snapshot(c.signal)); });
