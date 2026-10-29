import { createI18n } from './i18n.js';
export function createNativeClient(win, { timeoutMs = 120000, onTeardown = () => {}, i18n = createI18n(win.openai?.locale) } = {}) {
  const tr = i18n.t;
  let next = 0, initialized = false, disposed = false;
  const pending = new Map();
  const listeners = new Set();
  const send = message => win.parent.postMessage({ jsonrpc: '2.0', ...message }, '*');
  function request(method, params, signal) {
    if (disposed) return Promise.reject(Error(tr('stopped')));
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const id = ++next;
      const finish = (error, value) => { const p = pending.get(id); if (!p) return; pending.delete(id); clearTimeout(p.timer); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(value); };
      const abort = () => { send({ method: 'notifications/cancelled', params: { requestId: id } }); finish(signal.reason || Error(tr('aborted'))); };
      const timer = setTimeout(() => { send({ method: 'notifications/cancelled', params: { requestId: id } }); finish(Error(tr('requestTimeout', {method}))); }, timeoutMs);
      pending.set(id, { finish, timer }); signal?.addEventListener('abort', abort, { once: true });
      send({ id, method, params });
    });
  }
  const onMessage = event => {
    if (event.source !== win.parent || event.data?.jsonrpc !== '2.0') return;
    const m = event.data;
    if (m.method === 'ui/resource-teardown') { if (m.id != null) send({ id: m.id, result: {} }); onTeardown(); dispose(); return; }
    if (m.id != null) pending.get(m.id)?.finish(m.error ? Error(m.error.message) : null, m.result);
    else if (m.method === 'ui/notifications/host-context-changed') for (const cb of listeners) cb(m.params);
  };
  win.addEventListener('message', onMessage);
  async function initialize() {
    const result = await request('ui/initialize', { appInfo: { name: 'worktree-navigator', version: '0.3.0' }, appCapabilities: {}, protocolVersion: '2026-01-26' });
    send({ method: 'ui/notifications/initialized' }); initialized = true; return result;
  }
  function dispose() {
    if (disposed) return;
    for (const [id, p] of pending) { send({ method: 'notifications/cancelled', params: { requestId: id } }); p.finish(Error(tr('stopped'))); }
    disposed = true; listeners.clear(); win.removeEventListener('message', onMessage);
  }
  return {
    initialize,
    async snapshot(force, signal) {
      if (!initialized) throw Error(tr('notInitialized'));
      const result = await request('tools/call', { name: 'open_worktree_navigator', arguments: { action: 'snapshot', force, locale: i18n.locale } }, signal);
      if (result?.isError) throw Error(result.content?.find(x => x.type === 'text')?.text || tr('readFailed'));
      const data = result?.structuredContent;
      if (!data || !Array.isArray(data.repositories) || !Array.isArray(data.errors)) throw Error(tr('invalidResponse'));
      return data;
    },
    async createSession(args) {
      if (!initialized) throw Error(tr('notInitialized'));
      const result = await request('tools/call', {name: 'create_worktree_session', arguments: {...args, locale: i18n.locale}});
      if (result?.isError) throw Error(result.content?.find(x => x.type === 'text')?.text || tr('createFailed'));
      if (!result?.structuredContent?.threadId) throw Error(tr('noThreadId'));
      return result.structuredContent;
    },
    async cleanupWorktree(args) {
      if (!initialized) throw Error(tr('notInitialized'));
      const result = await request('tools/call',{name:'cleanup_worktree',arguments:{...args,locale:i18n.locale}});
      if (result?.isError) throw Error(result.content?.find(x=>x.type==='text')?.text || tr('cleanupCheck'));
      if (result?.structuredContent?.removed !== true) throw Error(tr('cleanupCheck'));
      return result.structuredContent;
    },
    async navigate(url) {
      if (!initialized) throw Error(tr('notInitialized'));
      const target = new URL(url);
      if (target.protocol !== 'codex:' || target.hostname !== 'threads') throw Error(tr('unsupportedNavigation'));
      if (typeof win.openai?.openExternal === 'function') return win.openai.openExternal({ href: url });
      return request('ui/open-link', { url });
    },
    onContext(cb) { listeners.add(cb); return () => listeners.delete(cb); }, dispose,
  };
}
