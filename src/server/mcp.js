import { tr, withLocale } from './i18n.js';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHost } from '../host.js';

export function createMcpHandler({ host = createHost(), html, uri }) {
  const icon = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M8 14c7 0 10-1 10-5"/></g></svg>').toString('base64');
  const tool = {
    name: 'open_worktree_navigator', title: 'Worktrees', description: tr('browseDescription'),
    icons: [{ src: icon, mimeType: 'image/svg+xml' }],
    inputSchema: { type: 'object', properties: { locale: {type: 'string', enum: ['en', 'zh-CN']}, action: { type: 'string', enum: ['status', 'snapshot'] }, force: { type: 'boolean' } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: uri, visibility: ['app'] }, 'openai/ui': { entrypoints: [{ type: 'global' }] } },
  };
  const createTool = { name: 'create_worktree_session', title: tr('createTitle'),
    description: tr('createDescription'),
    inputSchema: {type: 'object', properties: {locale: {type: 'string', enum: ['en', 'zh-CN']}, projectId: {type: 'string'}, worktreePath: {type: 'string'}, text: {type: 'string', maxLength: 32000}, requestId: {type: 'string'}}, required: ['projectId', 'worktreePath', 'requestId'], additionalProperties: false},
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true},
    _meta: {ui: {visibility: ['app']}} };
  const cleanupTool = {
    name:'cleanup_worktree', title:tr('cleanupTitle'), description:tr('cleanupDescription'),
    inputSchema:{type:'object',properties:{worktreePath:{type:'string'},confirmed:{const:true},requestId:{type:'string'},locale:{type:'string',enum:['en','zh-CN']}},required:['worktreePath','confirmed','requestId'],additionalProperties:false},
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false},
    _meta:{ui:{visibility:['app']}},
  };
  async function handle(method, params = {}, signal) {
    if (method === 'tools/call' && params.arguments?.locale != null && !['en', 'zh-CN'].includes(params.arguments.locale)) {
      throw Object.assign(Error(tr('invalidNavigatorArgs')), {code: -32602});
    }
    switch (method) {
      case 'initialize': return { protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'worktree-navigator', version: '0.3.0' } };
      case 'ping': return {};
      case 'tools/list': return { tools: [{...tool, description: tr('browseDescription')}, {...createTool, title: tr('createTitle'), description: tr('createDescription')}, {...cleanupTool,title:tr('cleanupTitle'),description:tr('cleanupDescription')}] };
      case 'resources/list': return { resources: [{ uri, name: 'Worktrees', mimeType: 'text/html;profile=mcp-app' }] };
      case 'resources/templates/list': return { resourceTemplates: [] };
      case 'resources/read':
        if (params.uri !== uri) throw Object.assign(Error(tr('unknownResource')), { code: -32602 });
        return { contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: html, _meta: { ui: { prefersBorder: false }, 'openai/ui': { availableDisplayModes: ['fullscreen', 'inline'], preferredDisplayMode: 'fullscreen' } } }] };
      case 'tools/call': {
        if (params.name === cleanupTool.name) {
          const args = params.arguments;
          if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k=>!['worktreePath','confirmed','requestId','locale'].includes(k))) throw Object.assign(Error(tr('cleanupInvalid')),{code:-32602});
          try { return {content:[{type:'text',text:tr('cleanupDone')}],structuredContent:await host.cleanupWorktree(args)}; }
          catch(e) { return {isError:true,content:[{type:'text',text:e.message}]}; }
        }
        if (params.name === createTool.name) {
          const args = params.arguments;
          if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => !['projectId','worktreePath','text','requestId','locale'].includes(k))) throw Object.assign(Error(tr('invalidSessionArgs')), {code: -32602});
          try { return {content: [{type: 'text', text: tr('sessionCreated')}], structuredContent: await host.createSession(args)}; }
          catch (e) { return {isError: true, content: [{type: 'text', text: e.message}]}; }
        }
        if (params.name !== tool.name) throw Object.assign(Error(tr('unknownTool')), { code: -32602 });
        const args = params.arguments ?? {};
        if (typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => !['action', 'force', 'locale'].includes(k)) || (args.action != null && !['status', 'snapshot'].includes(args.action)) || (args.force != null && typeof args.force !== 'boolean')) throw Object.assign(Error(tr('invalidNavigatorArgs')), { code: -32602 });
        try {
          const data = args.action === 'snapshot' ? await host.snapshot(signal, { force: args.force === true }) : { ready: true, version: '0.3.0' };
          return { content: [{ type: 'text', text: args.action === 'snapshot' ? tr('repositoriesRead', {count: data.repositories.length}) : tr('ready') }], structuredContent: data };
        } catch (e) { if (signal?.aborted) throw e; return { isError: true, content: [{ type: 'text', text: e.message }] }; }
      }
      default: throw Object.assign(Error(tr('methodNotFound')), { code: -32601 });
    }
  }
  return (method, params = {}, signal) => withLocale(params?.arguments?.locale, () => handle(method, params, signal));
}

export async function serve({ input = process.stdin, output = process.stdout, handler } = {}) {
  if (!handler) {
    const html = await readFile(new URL('../../page.html', import.meta.url), 'utf8');
    const { uri } = JSON.parse(await readFile(new URL('../../resource.json', import.meta.url), 'utf8'));
    handler = createMcpHandler({ html, uri });
  }
  const pending = new Map(), jobs = new Set();
  const send = message => output.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  try {
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      let m;
      try { m = JSON.parse(line); } catch { send({ id: null, error: { code: -32700, message: tr('parseError') } }); continue; }
      if (m?.method === 'notifications/cancelled') { pending.get(m.params?.requestId)?.abort(); continue; }
      if (m?.id == null) continue;
      if (m.jsonrpc !== '2.0' || !['string', 'number'].includes(typeof m.id) || typeof m.method !== 'string' || pending.has(m.id)) { send({ id: m.id, error: { code: -32600, message: tr('invalidRequest') } }); continue; }
      const controller = new AbortController(); pending.set(m.id, controller);
      const job = Promise.resolve().then(() => handler(m.method, m.params, controller.signal)).then(result => send({ id: m.id, result }), e => send({ id: m.id, error: { code: e.code || -32603, message: e.message || tr('navigatorError') } })).finally(() => { pending.delete(m.id); jobs.delete(job); });
      jobs.add(job);
    }
  } finally { for (const c of pending.values()) c.abort(); await Promise.allSettled(jobs); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) serve().catch(e => { process.stderr.write(e.message + '\n'); process.exitCode = 1; });
