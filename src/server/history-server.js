import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { tr } from './i18n.js';

// Separate read and creation transports; their runtime state is never Desktop state.
const READ_METHODS = ['project/list', 'thread/list'];
const CREATE_METHODS = [...READ_METHODS, 'project/read', 'config/read', 'thread/start', 'thread/name/set', 'thread/settings/update', 'thread/archive', 'thread/unarchive', 'thread/loaded/list', 'thread/queue/add'];

export const withHistoryServer = (work, options) => withServer(work, READ_METHODS, options);
export const withSessionServer = (work, options) => withServer(work, CREATE_METHODS, options);

async function withServer(work, methods, {
  cli = process.env.CODEX_CLI_PATH, signal, timeoutMs = 15000, spawnProcess = spawn,
} = {}) {
  signal?.throwIfAborted();
  if (!cli) throw Error(tr('historyCliMissing'));
  const child = spawnProcess(cli, ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let next = 0, failure;
  const fail = error => {
    if (failure) return;
    failure = error;
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); }
    pending.clear();
    child.kill();
  };
  child.on('error', fail);
  child.stdin.on('error', fail);
  child.stderr.resume();
  child.on('exit', () => fail(Error(tr('connectionClosed'))));
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    try {
      const message = JSON.parse(line);
      const p = pending.get(message.id);
      if (!p) return;
      pending.delete(message.id); clearTimeout(p.timer);
      message.error ? p.reject(Error(message.error.message)) : p.resolve(message.result);
    } catch { fail(Error(tr('invalidResponse'))); }
  });
  const request = (method, params) => {
    if (!['initialize', ...methods].includes(method)) return Promise.reject(Error(tr('unsupportedOperation')));
    if (failure) return Promise.reject(failure);
    signal?.throwIfAborted();
    const id = ++next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail(Error(tr('requestTimeout', { method }))), timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  };
  const abort = () => fail(signal.reason || Error(tr('aborted')));
  signal?.addEventListener('abort', abort, { once: true });
  try {
    await request('initialize', { clientInfo: { name: 'worktree_navigator', version: '0.3.1' }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
    return await work((method, params) => {
      if (!methods.includes(method)) return Promise.reject(Error(tr('unsupportedOperation')));
      return request(method, params);
    });
  } finally {
    signal?.removeEventListener('abort', abort);
    lines.close(); fail(Error(tr('connectionFinished')));
  }
}
