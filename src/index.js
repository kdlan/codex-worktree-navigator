import { createLocaleController } from './i18n.js';
import { createNativeClient } from './native-client.js';
import { createView } from './view.js';

export async function startNavigator(win, css) {
  const language = createLocaleController(win);
  const i18n = language.i18n, tr = i18n.t;
  const client = createNativeClient(win, { i18n, onTeardown: () => dispose() });
  const controller = new AbortController();
  let disposed = false, running = false, queued = false, forceQueued = false, fingerprint = '', initialized = false;
  const view = createView({ win, css, i18n, cleanupWorktree: args => client.cleanupWorktree(args), createSession: args => client.createSession(args), navigate: url => client.navigate(url), onRefresh: force => void refresh(force) });
  win.document.body.append(view.root);
  function applyLocale() {
    win.document.documentElement.lang = i18n.locale;
    view.updateLocale();
    fingerprint = '';
    if (initialized) void refresh();
  }
  applyLocale();
  async function refresh(force = false) {
    if (disposed) return;
    if (running) { queued = true; forceQueued ||= force; return; }
    running = true; view.setBusy(true);
    try {
      const requestLocale = i18n.locale;
      const snapshot = await client.snapshot(force, controller.signal);
      if (requestLocale !== i18n.locale) { queued = true; return; }
      if (disposed) return;
      const signature = JSON.stringify(snapshot);
      if (signature !== fingerprint) { fingerprint = signature; view.render(snapshot.repositories, snapshot.errors); }
    } catch (error) { if (!disposed) { fingerprint = ''; view.notice(tr('loadFailed', {detail: error.message})); } }
    finally { running = false; if (!disposed) { view.setBusy(false); if (queued) { const next = forceQueued; queued = false; forceQueued = false; void refresh(next); } } }
  }
  const focus = () => { if (!win.document.hidden) void refresh(); };
  let timer;
  function applyContext(context) {
    if (['light', 'dark'].includes(context?.theme)) win.document.documentElement.style.colorScheme = context.theme;
    const before = i18n.locale;
    language.setHostLocale(context?.locale);
    if (before !== i18n.locale) applyLocale();
  }
  const stopContext = client.onContext(applyContext);
  function dispose() {
    if (disposed) return;
    disposed = true; controller.abort(); clearInterval(timer); stopContext(); client.dispose(); view.dispose();
    win.removeEventListener('focus', focus); win.document.removeEventListener('visibilitychange', focus); win.removeEventListener('pagehide', dispose);
  }
  win.addEventListener('pagehide', dispose, { once: true });
  view.setBusy(true);
  try {
    const initial = await client.initialize();
    applyContext(initial?.hostContext);
    initialized = true;
    if (disposed) return dispose;
    win.addEventListener('focus', focus); win.document.addEventListener('visibilitychange', focus);
    timer = setInterval(focus, 60000);
    await refresh();
  } catch (error) { if (!disposed) { view.setBusy(false); view.notice(tr('initFailed', {detail: error.message})); } }
  return dispose;
}
