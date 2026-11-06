import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { withDesktopTools, desktopCaller, withDesktopCaller } from '../src/server/desktop.js';
import { createDesktopHost } from '../src/desktop-host.js';
import { createMcpHandler } from '../src/server/mcp.js';
import { localGitQuery } from '../src/server/git.js';

async function fixture(work, mode = 'normal') {
  await mkdir('.agents/state', { recursive: true });
  const dir = await mkdtemp(resolve('.agents/state/desktop-'));
  const path = join(dir, 's'), sockets = new Set(), calls = [];
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32LE()) {
        const n = buffer.readUInt32LE(), m = JSON.parse(buffer.subarray(4, 4 + n)); buffer = buffer.subarray(4 + n); calls.push(m);
        if (mode === 'silent') continue;
        if (mode === 'close') { socket.destroy(); return; }
        if (mode === 'oversize') { const h = Buffer.alloc(4); h.writeUInt32LE(8 * 1024 * 1024 + 1); socket.write(h); return; }
        const result = m.method === 'tools/list' ? { tools: ['list_projects', 'list_threads'].map(name => ({ name, namespace: 'codex_app' })) } : { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify({ projects: [] }) }] };
        const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: m.id, result })), header = Buffer.alloc(4); header.writeUInt32LE(body.length);
        const frame = Buffer.concat([header, body]); socket.write(frame.subarray(0, 2)); setImmediate(() => { if (!socket.destroyed) socket.write(frame.subarray(2)); });
      }
    });
  });
  await new Promise(r => server.listen(path, r));
  try { await work({ pipePath: path, caller: { threadId: 'real-caller' }, timeoutMs: 500 }, calls); }
  finally { for (const s of sockets) s.destroy(); await new Promise(r => server.close(r)); await rm(dir, { recursive: true, force: true }); }
}

test('Desktop length frames tolerate split headers and preserve genuine caller context', () => fixture(async (options, calls) => {
  await withDesktopTools(async call => {
    assert.deepEqual(await call('list_projects', {}), { projects: [] });
    await assert.rejects(call('create_thread', {}), /Unsupported/);
  }, options);
  const p = calls.find(m => m.method === 'tools/call').params;
  assert.equal(p.threadId, 'real-caller'); assert.equal(p.hostId, 'local'); assert.equal(p.namespace, 'codex_app');
}));
for (const mode of ['close', 'silent', 'oversize']) test(`Desktop ${mode} rejects rather than returning empty history`, () => fixture(options => assert.rejects(withDesktopTools(() => {}, options)), mode));
test('Desktop cancellation rejects pending reads', () => fixture(async options => {
  const c = new AbortController(); const timer = setTimeout(() => c.abort(), 20);
  try { await assert.rejects(withDesktopTools(() => {}, { ...options, signal: c.signal })); }
  finally { clearTimeout(timer); }
}, 'silent'));
test('caller metadata is scoped per concurrent request and no caller is invented', async () => {
  assert.equal(desktopCaller({}, {}), null);
  assert.deepEqual(desktopCaller({ 'x-codex-turn-metadata': '{"thread_id":"one","turn_id":"turn"}' }, {}), { threadId: 'one', turnId: 'turn' });
  await assert.rejects(withDesktopTools(() => {}, { pipePath: '/unused', caller: null }), /caller context/);
  await Promise.all(['one', 'two'].map(id => withDesktopCaller({ 'openai/threadId': id }, () => assert.rejects(withDesktopTools(() => {}, { pipePath: '' }), /connection is unavailable/))));
});

test('Desktop host maps local paginated live and archived history and denies writes before connecting', async () => {
  const calls = [];
  const git = {
    metadata: async path => ({ root: path, commonDir: '/repo/.git' }),
    worktrees: async () => [{ root: '/repo' }, { root: '/extra', headRef: { type: 'branch', string: 'feature' } }],
    status: async () => ({ type: 'success' }),
  };
  const host = createDesktopHost({ git, connect: async work => work(async (tool, p) => {
    calls.push([tool, p]);
    if (tool === 'list_projects') return { projects: [{ projectKind: 'local', hostId: 'local', path: '/repo', label: 'Repo' }, { projectKind: 'remote', hostId: 'ssh', path: '/remote' }] };
    return { threads: [{ id: p.archived ? 'archived' : p.cursor ? 'second' : 'live', kind: 'codex', hostId: 'local', cwd: '/extra', title: 'Name', status: p.archived ? 'notLoaded' : 'active', updatedAt: 10 }], nextCursor: !p.archived && !p.cursor ? 'next' : null };
  }) });
  const snapshot = await host.snapshot();
  assert.deepEqual(snapshot.capabilities, { createSession: false, cleanupWorktree: false });
  assert.equal(snapshot.repositories[0].worktrees[0].threads.length, 3);
  assert.equal(snapshot.repositories[0].worktrees[0].threads.find(t => t.id === 'live').status, 'active');
  assert.equal(snapshot.repositories[0].worktrees[0].threads.find(t => t.id === 'archived').archived, true);
  assert.equal(calls.filter(([t]) => t === 'list_threads').length, 3);
  const before = calls.length;
  await assert.rejects(host.cleanupWorktree({ confirmed: true, worktreePath: '/extra' }), /complete list/);
  await assert.rejects(host.createSession({}), /Create sessions/);
  assert.equal(calls.length, before);
  const h = createMcpHandler({ host, html: '', uri: 'ui://test' });
  assert.equal((await h('tools/call', { name: 'cleanup_worktree', arguments: { worktreePath: '/extra', confirmed: true, requestId: 'request-123' } })).isError, true);
});
test('Desktop local Git transport accepts fixed discovery commands and rejects arbitrary or destructive argv', async () => {
  for (const command of [['git', '-C', '/repo', 'worktree', 'remove', '/extra'], ['sh', '-c', 'true'], ['git', '-C', '/other', 'status', '--porcelain=v1', '-z', '--untracked-files=no']]) {
    await assert.rejects(localGitQuery('command/exec', { cwd: '/repo', command }), /Unsupported/);
  }
});
