import test from 'node:test';import assert from 'node:assert/strict';
import { createI18n } from '../src/i18n.js';
import { createNativeClient } from '../src/native-client.js';
function fixture({ rejectInit = false, silent = false, i18n = createI18n('en') } = {}) {
  const win = new EventTarget(), calls = [];
  win.parent = { postMessage(m) { calls.push(m); if (m.id == null || silent) return; const data = { jsonrpc: '2.0', id: m.id, ...(m.method === 'ui/initialize' && rejectInit ? { error: { message: 'Denied' } } : { result: m.method === 'ui/initialize' ? { protocolVersion: '2026-01-26' } : { structuredContent: m.params?.name === 'create_worktree_session' ? { threadId: 'new/thread', projectId: m.params.arguments.projectId, cwd: m.params.arguments.worktreePath } : { repositories: [], errors: [] } } }) }; queueMicrotask(() => win.dispatchEvent(new MessageEvent('message', { data, source: undefined }))); } };
  // EventTarget does not accept arbitrary MessageEvent.source in Node.
  const listeners = new Set();win.addEventListener = (_, cb) => listeners.add(cb); win.removeEventListener = (_, cb) => listeners.delete(cb);
  win.dispatchEvent = e => { for (const cb of listeners) cb({ data: e.data, source: win.parent }); };
  win.openai = { openExternal: async m => calls.push({ method: 'openExternal', params: m }) };
  return { win, calls, listeners, client: createNativeClient(win, { timeoutMs: 30, i18n }) };
}
test('native initialization always handshakes before tools, including when legacy APIs exist', async () => { const f = fixture(); try { await assert.rejects(f.client.snapshot(false), /initialized/); await f.client.initialize(); await f.client.snapshot(true); assert.deepEqual(f.calls.slice(0,3).map(m => m.method), ['ui/initialize','ui/notifications/initialized','tools/call']); } finally { f.client.dispose(); } });
test('initialization failure never enables reads', async () => { const f = fixture({ rejectInit: true }); try { await assert.rejects(f.client.initialize(), /Denied/); await assert.rejects(f.client.snapshot(false), /initialized/); assert.equal(f.calls.length,1); } finally { f.client.dispose(); } });
test('pending timeout and disposal clear listeners and cancel requests', async () => { const f = fixture({ silent: true }); await assert.rejects(f.client.initialize(), /timed out/); assert.equal(f.calls.at(-1).method,'notifications/cancelled'); f.client.dispose(); assert.equal(f.listeners.size,0); await assert.rejects(f.client.initialize(), /stopped/); });
test('only explicit Codex thread URLs navigate through the native host', async () => { const f = fixture(); try { await f.client.initialize(); await f.client.navigate('codex://threads/t'); assert.equal(f.calls.at(-1).method,'openExternal'); await assert.rejects(f.client.navigate('https://example.com'), /Unsupported/); } finally { f.client.dispose(); } });
test('host teardown request receives a result and disposes the page client', async () => { const f = fixture(); f.win.dispatchEvent({ data: {jsonrpc:'2.0',id:900,method:'ui/resource-teardown'} }); assert.deepEqual(f.calls.at(-1),{jsonrpc:'2.0',id:900,result:{}}); assert.equal(f.listeners.size,0); });

test('page language travels with snapshot and creation requests without changing message text', async () => {
  const i18n = createI18n('zh-CN'); const f = fixture({i18n});
  try {
    await f.client.initialize(); await f.client.snapshot(false);
    assert.equal(f.calls.at(-1).params.arguments.locale, 'zh-CN');
    i18n.setLocale('en');
    await f.client.createSession({projectId:'p',worktreePath:'/extra',requestId:'request-123',text:' 原文\n'});
    assert.equal(f.calls.at(-1).params.arguments.locale, 'en');
    assert.equal(f.calls.at(-1).params.arguments.text, ' 原文\n');
  } finally { f.client.dispose(); }
});
