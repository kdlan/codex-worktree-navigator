import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { tr } from './i18n.js';

const context = new AsyncLocalStorage();
const MAX_FRAME = 8 * 1024 * 1024;
const TOOLS = new Set(['list_projects', 'list_threads']);

export function desktopCaller(meta = {}, env = process.env) {
  let turn = meta['x-codex-turn-metadata'];
  if (typeof turn === 'string') { try { turn = JSON.parse(turn); } catch { turn = null; } }
  const threadId = meta['openai/threadId'] ?? meta['openai/thread_id'] ?? turn?.thread_id ?? env.CODEX_THREAD_ID;
  return typeof threadId === 'string' && threadId.trim() ? { threadId, turnId: turn?.turn_id } : null;
}

export function withDesktopCaller(meta, work) {
  return context.run(desktopCaller(meta), work);
}

// The Desktop launches the bundled Node directly so its signed process ancestry is retained.
// This is the host's app-tools protocol, not an App Server JSON-RPC transport.
export async function withDesktopTools(work, {
  pipePath = process.env.CODEX_APP_TOOLS_PIPE_PATH, caller = context.getStore(), signal, timeoutMs = 15000,
} = {}) {
  signal?.throwIfAborted();
  if (!pipePath) throw Error(tr('desktopPipeMissing'));
  if (!caller?.threadId) throw Error(tr('desktopCallerMissing'));
  const socket = net.createConnection(pipePath);
  let buffer = Buffer.alloc(0), next = 0, failed;
  const pending = new Map();
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const fail = error => {
    if (failed) return;
    failed = error instanceof Error ? error : Error(String(error));
    readyReject(failed);
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(failed); }
    pending.clear(); socket.destroy();
  };
  socket.once('connect', () => readyResolve());
  socket.on('error', e => fail(Error(tr('desktopConnectionFailed', { detail: e.code || e.message }))));
  socket.on('close', () => fail(Error(tr('desktopConnectionClosed'))));
  socket.on('data', chunk => {
    try {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readUInt32LE();
        if (!length || length > MAX_FRAME) throw Error(tr('invalidDesktopResponse'));
        if (buffer.length < 4 + length) return;
        const response = JSON.parse(buffer.subarray(4, 4 + length).toString('utf8'));
        buffer = buffer.subarray(4 + length);
        if (response?.jsonrpc !== '2.0' || !Number.isInteger(response.id) || (!Object.hasOwn(response, 'result') && !response.error)) throw Error(tr('invalidDesktopResponse'));
        const p = pending.get(response.id);
        if (!p) continue;
        clearTimeout(p.timer); pending.delete(response.id);
        response.error ? p.reject(Error(response.error.message || tr('invalidDesktopResponse'))) : p.resolve(response.result);
      }
    } catch (e) { fail(e); }
  });
  const abort = () => fail(signal.reason || Error(tr('aborted')));
  signal?.addEventListener('abort', abort, { once: true });
  const connectTimer = setTimeout(() => fail(Error(tr('handshakeTimeout'))), timeoutMs);
  function request(method, params) {
    if (failed) return Promise.reject(failed);
    signal?.throwIfAborted();
    const id = ++next;
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    if (body.length > MAX_FRAME) return Promise.reject(Error(tr('invalidDesktopResponse')));
    const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail(Error(tr('requestTimeout', { method }))), timeoutMs);
      pending.set(id, { resolve, reject, timer });
      socket.write(Buffer.concat([header, body]));
    });
  }
  try {
    await ready; clearTimeout(connectTimer);
    const catalog = await request('tools/list', { threadStartKind: 'all' });
    if (!Array.isArray(catalog?.tools) || [...TOOLS].some(name => !catalog.tools.some(t => t.name === name && t.namespace === 'codex_app'))) throw Error(tr('desktopToolsMissing'));
    return await work(async (tool, args) => {
      if (!TOOLS.has(tool)) throw Error(tr('unsupportedOperation'));
      const result = await request('tools/call', {
        namespace: 'codex_app', tool, arguments: args, callerSource: 'codex', hostId: 'local',
        threadId: caller.threadId, turnId: caller.turnId || `mcp-turn-${randomUUID()}`, callId: `mcp-call-${randomUUID()}`,
      });
      if (result?.success !== true || !Array.isArray(result.contentItems)) throw Error(tr('desktopReadFailed'));
      const text = result.contentItems.filter(item => item.type === 'inputText').map(item => item.text).join('\n');
      try { return JSON.parse(text); } catch { throw Error(tr('invalidDesktopResponse')); }
    });
  } finally {
    clearTimeout(connectTimer); signal?.removeEventListener('abort', abort); fail(Error(tr('connectionFinished')));
  }
}
