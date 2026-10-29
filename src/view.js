import { createI18n } from './i18n.js';
import { worktreeLabel, threadLink } from './model.js';

export function createView({ win, css, navigate, onRefresh, createSession, cleanupWorktree, i18n = createI18n(win.openai?.locale) }) {
  const tr = i18n.t;
  const doc = win.document;
  const root = doc.createElement('section');
  root.dataset.worktreeNavigator = 'page'; root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'Worktree Navigator');
  const style = doc.createElement('style'); style.dataset.worktreeNavigatorStyle = 'true'; style.textContent = css; doc.head.append(style);
  const storageKey = 'worktree-navigator-expanded-v1';
  let expanded;
  try { expanded = JSON.parse(win.localStorage.getItem(storageKey) || '{}'); } catch { expanded = {}; }
  if (!expanded || typeof expanded !== 'object' || Array.isArray(expanded)) expanded = {};
  let tree = [], error = '', warnings = [], busy = false, loaded = false, disposed = false;
  let dialog = null, updateDialog = null;
  let renderAbort = new AbortController();
  const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  function button(label, text, action, cls = 'wtn-tool') {
    const b = el('button', cls, text); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); action(); }, { signal: renderAbort.signal });
    return b;
  }
  function save() { try { win.localStorage.setItem(storageKey, JSON.stringify(expanded)); } catch { notice(tr('saveFailed')); } }
  function group(key, cls, summaryNodes, children, defaultOpen = false) {
    const d = el('details', cls); d.dataset.wtnKey = key;
    d.open = Object.hasOwn(expanded, key) ? expanded[key] === true : defaultOpen;
    const summary = el('summary'); summary.append(...summaryNodes); d.append(summary);
    let filled = false;
    const fill = () => { if (!filled && d.open) { filled = true; children(d); } };
    fill();
    d.addEventListener('toggle', () => { if (disposed || !d.isConnected) return; expanded[key] = d.open; save(); fill(); }, { signal: renderAbort.signal });
    return d;
  }
  async function open(url) { try { await navigate(url); } catch (e) { if (!disposed) notice(tr('navigationFailed', {detail: e.message})); } }
  function showCreate(w, r) {
    if (dialog) return;
    const modal = el('dialog', 'wtn-create-dialog'); dialog = modal;
    const heading = el('h2', '', tr('newSession'));
    const path = el('p', 'wtn-path', w.root);
    const project = el('select'); project.setAttribute('aria-label', tr('originalProject'));
    for (const p of r.projectOptions || []) { const option = el('option', '', p.name); option.value = p.id; project.append(option); }
    const input = el('textarea'); input.rows = 5; input.maxLength = 32000;
    input.placeholder = tr('firstMessagePlaceholder'); input.setAttribute('aria-label', tr('firstMessage'));
    const hint = el('p', 'wtn-hint', tr('readOnlyHint'));
    const status = el('p', 'wtn-error'); status.setAttribute('role', 'status');
    const actions = el('div', 'wtn-tools');
    const cancel = el('button', '', tr('cancel')); cancel.type = 'button';
    const submit = el('button', '', tr('createSession')); submit.type = 'button';
    let pending = false, result = null, attempted = false;
    const requestId = win.crypto.randomUUID();
    if (!project.options.length) { submit.disabled = true; status.textContent = tr('noProject'); }
    const close = () => { if (pending) return; modal.remove(); dialog = null; updateDialog = null; if (!disposed) paint(); };
    cancel.addEventListener('click', close);
    modal.addEventListener('cancel', e => { e.preventDefault(); close(); });
    submit.addEventListener('click', async () => {
      if (pending || (attempted && !result)) return;
      pending = true; submit.disabled = true; cancel.disabled = true;
      input.disabled = true; project.disabled = true; submit.setAttribute('aria-busy', 'true');
      submit.textContent = result ? tr('opening') : tr('creating'); status.textContent = '';
      try {
        if (!result) { attempted = true; result = await createSession({worktreePath: w.root, projectId: project.value, text: input.value, requestId}); }
        await navigate(threadLink(result.threadId, tr));
        pending = false; close(); onRefresh(true);
      } catch (e) {
        status.textContent = e.message;
        submit.textContent = result ? tr('openCreated') : tr('checkSessions');
      } finally {
        pending = false; submit.disabled = attempted && !result; cancel.disabled = false; submit.setAttribute('aria-busy', 'false'); updateDialog?.();
      }
    });
    updateDialog = () => {
      heading.textContent = tr('newSession');
      project.setAttribute('aria-label', tr('originalProject'));
      input.placeholder = tr('firstMessagePlaceholder');
      input.setAttribute('aria-label', tr('firstMessage'));
      hint.textContent = tr('readOnlyHint');
      cancel.textContent = tr('cancel');
      submit.textContent = pending ? tr(result ? 'opening' : 'creating') : tr(result ? 'openCreated' : attempted ? 'checkSessions' : 'createSession');
      if (!project.options.length) status.textContent = tr('noProject');
    };
    actions.append(cancel, submit); modal.append(heading, path, project, input, hint, status, actions);
    root.append(modal); modal.showModal(); input.focus();
  }
  function showCleanup(w) {
    if (dialog) return;
    const modal = el('dialog','wtn-create-dialog'); dialog = modal;
    const heading = el('h2'), path = el('p','wtn-cleanup-path',w.root), hint = el('p'), status = el('p','wtn-error');
    status.setAttribute('role','status');
    const actions = el('div','wtn-tools'), cancel = el('button'), submit = el('button');
    cancel.type = submit.type = 'button';
    let pending = false, attempted = false;
    const requestId = win.crypto.randomUUID();
    const close = () => { if(pending)return; modal.remove();dialog=null;updateDialog=null;if(!disposed)paint(); };
    updateDialog = () => {
      heading.textContent=tr('cleanupTitle');hint.textContent=tr('cleanupConfirm');cancel.textContent=tr('cancel');
      submit.textContent=tr(pending?'cleaning':attempted?'cleanupCheck':'cleanupSubmit');
    };
    cancel.addEventListener('click',close);
    modal.addEventListener('cancel',e=>{e.preventDefault();close();});
    submit.addEventListener('click',async()=>{
      if(pending || attempted)return;
      pending=attempted=true;submit.disabled=cancel.disabled=true;submit.setAttribute('aria-busy','true');updateDialog();
      try {
        await cleanupWorktree({worktreePath:w.root,confirmed:true,requestId});
        tree=tree.map(r=>({...r,worktrees:r.worktrees.filter(item=>item.root!==w.root)})).filter(r=>r.worktrees.length);
        pending=false;close();onRefresh(true);
      } catch(e) {status.textContent=e.message;}
      finally {pending=false;cancel.disabled=false;submit.setAttribute('aria-busy','false');updateDialog?.();}
    });
    updateDialog();actions.append(cancel,submit);modal.append(heading,path,hint,status,actions);root.append(modal);modal.showModal();cancel.focus();
  }
  function worktree(w, r) {
    const branch = el('span', 'wtn-branch', worktreeLabel(w, tr));
    const path = el('span', 'wtn-path', w.root); path.title = w.root;
    const count = el('span', 'wtn-count', tr(w.threads.length === 1 ? 'sessionCountOne' : 'sessionCount', {count: w.threads.length}));
    if (w.status?.stagedCount || w.status?.unstagedCount) branch.title = tr('gitStatus', {staged: w.status.stagedCount, unstaged: w.status.unstagedCount});
    const add = button(tr('newInPath', {path: w.root}), tr('newButton'), () => showCreate(w, r), 'wtn-new');
    const cleanup = button(tr('cleanupTitle'),tr('cleanup'),()=>showCleanup(w),'wtn-cleanup');
    return group(`worktree:${r.commonDir}:${w.root}`, 'wtn-worktree', [branch, path, count, add, cleanup], d => {
      const sessions = el('div', 'wtn-sessions');
      for (const t of w.threads) {
        const name = t.name || t.preview || tr('untitled');
        const row = el('div', 'wtn-thread'); row.dataset.wtnThread = t.id;
        row.append(el('span', 'wtn-session-title', name));
        if (t.archived) row.append(el('span', 'wtn-muted', tr('archived')));
        const time = el('time', 'wtn-time');
        if (Number.isFinite(t.updatedAt)) { const date = new Date(t.updatedAt * 1000); time.dateTime = date.toISOString(); time.textContent = date.toLocaleString(i18n.locale); }
        else time.textContent = tr('unknownTime');
        const jump = button(tr('openSession', {name}), tr('open'), () => open(threadLink(t.id, tr)), 'wtn-open-session');
        jump.dataset.wtnOpenThread = t.id;
        row.append(time, jump); row.title = `${name}\n${t.cwd}\n${time.textContent}`; sessions.append(row);
      }
      if (!w.threads.length) sessions.append(el('p', 'wtn-empty-sessions', tr('noSessions')));
      d.append(sessions);
    });
  }
  function paintNotice() {
    const n = root.querySelector('[data-wtn-notice]');
    n.textContent = error || (warnings.length ? tr('partialPaths') : '');
    n.title = warnings.join('\n'); n.hidden = !n.textContent; n.className = error || warnings.length ? 'wtn-error' : 'wtn-hint';
    const b = root.querySelector('[data-wtn-refresh]'); b.disabled = busy; b.setAttribute('aria-busy', String(busy));
    b.setAttribute('aria-label', busy ? tr('refreshing') : tr('refreshLabel'));
    b.title = busy ? tr('refreshing') : tr('refreshLabel');
  }
  function notice(message) { error = message; paintNotice(); }
  function paint() {
    if (dialog) return;
    const focused = doc.activeElement?.dataset.wtnOpenThread;
    renderAbort.abort(); renderAbort = new AbortController(); root.replaceChildren();
    const header = el('header', 'wtn-header'); const title = el('div');
    title.append(Object.assign(el('h1', '', 'Worktrees'), { tabIndex: -1 }), el('p', 'wtn-subtitle', tr('subtitle')));
    const tools = el('div', 'wtn-tools');
    const refresh = button(tr('refreshLabel'), '', () => onRefresh(true)); refresh.dataset.wtnRefresh = 'true';
    const refreshIcon = el('span', 'wtn-refresh-icon', '↻'); refreshIcon.setAttribute('aria-hidden', 'true');
    refresh.append(refreshIcon, el('span', '', tr('refresh')));
    tools.append(refresh, button(tr('collapseAll'), tr('collapseAll'), () => { for (const d of root.querySelectorAll('details')) { expanded[d.dataset.wtnKey] = false; d.open = false; } save(); }));
    header.append(title, tools); root.append(header);
    const n = el('div'); n.dataset.wtnNotice = 'true'; n.setAttribute('role', 'status'); n.setAttribute('aria-live', 'polite'); root.append(n);
    const list = el('div', 'wtn-repositories');
    if (loaded && !tree.length) list.append(el('p', 'wtn-empty', warnings.length ? tr('pathsUnavailable') : tr('noWorktrees')));
    for (const r of tree) {
      const name = el('span', 'wtn-repo-name', r.name); name.title = r.mainRoot;
      const count = el('span', 'wtn-count', tr(r.worktrees.length === 1 ? 'worktreeCountOne' : 'worktreeCount', {count: r.worktrees.length}));
      const repo = group(`repo:${r.commonDir}`, 'wtn-repo', [name, count], d => { for (const w of r.worktrees) d.append(worktree(w, r)); }, true);
      repo.dataset.wtnRepository = r.commonDir; list.append(repo);
    }
    root.append(list); paintNotice();
    if (focused) [...root.querySelectorAll('[data-wtn-open-thread]')].find(n => n.dataset.wtnOpenThread === focused)?.focus();
  }
  paint();
  return { root, notice, updateLocale() {
      if (dialog) { updateDialog?.(); return; }
      paint();
    }, setBusy(value) { busy = value; paintNotice(); }, render(value, errs = []) { tree = value; loaded = true; error = ''; warnings = errs; paint(); },
    dispose() { disposed = true; renderAbort.abort(); root.remove(); style.remove(); } };
}
