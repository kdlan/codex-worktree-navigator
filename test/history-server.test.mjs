import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { withHistoryServer } from '../src/server/history-server.js';
import { createHistoryHost } from '../src/history-host.js';
import { createMcpHandler } from '../src/server/mcp.js';

function fixture(mode) {
  const calls = []; let killed = false;
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { killed = true; };
  child.stdin = new Writable({ write(chunk, _, done) {
    const m = JSON.parse(chunk); calls.push(m);
    if (m.id && mode !== 'silent') queueMicrotask(() => child.stdout.write(JSON.stringify({ id: m.id, ...(mode === 'error' ? { error: { message: 'denied' } } : { result: { data: [], nextCursor: null } }) }) + '\n'));
    done();
  } });
  return { calls, child, killed: () => killed, options: { cli: '/bundled/codex', timeoutMs: 40, spawnProcess: (cli, args) => {
    assert.equal(cli, '/bundled/codex'); assert.deepEqual(args, ['app-server', '--listen', 'stdio://']); return child;
  } } };
}
test('history reader works without caller metadata and permits only navigation reads', async () => {
  const f = fixture();
  await withHistoryServer(async rpc => {
    await rpc('project/list', {}); await rpc('thread/list', {});
    for (const method of ['thread/start', 'thread/loaded/list', 'command/exec', 'initialize']) await assert.rejects(rpc(method, {}), /Unsupported/);
  }, f.options);
  assert.deepEqual(f.calls.map(m => m.method), ['initialize', 'initialized', 'project/list', 'thread/list']);
  assert.ok(f.killed());
});
for (const mode of ['error', 'silent']) test(`history reader terminates on ${mode}`, async () => {
  const f = fixture(mode); await assert.rejects(withHistoryServer(() => {}, f.options)); assert.ok(f.killed());
});
test('history reader terminates on cancellation and process failure', async () => {
  for (const event of ['abort', 'error', 'exit']) {
    const f = fixture('silent'), controller = new AbortController();
    const promise = withHistoryServer(() => {}, { ...f.options, signal: controller.signal });
    if (event === 'abort') controller.abort(); else f.child.emit(event, event === 'error' ? Error('spawn failed') : 1);
    await assert.rejects(promise); assert.ok(f.killed());
  }
});
test('global MCP snapshot includes empty stored threads and exposes guarded actions', async () => {
  const calls = [];
  const host = createHistoryHost({
    readThreads: async () => ['archived', 'second', 'first'].map(id => ({ id, cwd: '/extra', name: 'Saved', archived: id === 'archived', status: 'notLoaded', preview: 'private' })),
    git: { metadata: async path => ({ root: path, commonDir: '/repo/.git' }), worktrees: async () => [{ root: '/repo' }, { root: '/extra' }], status: async () => ({ type: 'success' }) },
    connect: async work => work(async (method, p) => {
      calls.push([method, p]);
      if (method === 'project/list') return { data: [{ id: 'p', name: 'Repo', roots: [{ path: '/repo' }] }], nextCursor: p.cursor ? null : 'more' };
      return { data: [{ id: p.archived ? 'archived' : p.cursor ? 'second' : 'first', cwd: '/extra', name: 'Saved', preview: 'private text', status: { type: 'notLoaded' }, turns: [] }], nextCursor: !p.archived && !p.cursor ? 'more' : null };
    }),
  });
  const handler = createMcpHandler({ host, html: '', uri: 'ui://test' });
  const result = await handler('tools/call', { name: 'open_worktree_navigator', arguments: { action: 'snapshot' } });
  assert.equal(result.isError, undefined);
  const threads = result.structuredContent.repositories[0].worktrees[0].threads;
  assert.deepEqual(result.structuredContent.capabilities, { createSession: true, cleanupWorktree: true });
  assert.equal(threads.length, 3); assert.equal(threads.find(t => t.id === 'archived').archived, true);
  assert.ok(threads.every(t => !('status' in t) && !('turns' in t) && !('preview' in t)));
  assert.equal(calls.filter(([method]) => method === 'project/list').length, 2);
  const count = calls.length;
  await assert.rejects(host.createSession({})); await assert.rejects(host.cleanupWorktree({})); assert.equal(calls.length, count);
});
