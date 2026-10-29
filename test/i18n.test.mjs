import test from 'node:test';
import assert from 'node:assert/strict';
import { messages, createI18n, normalizeLocale, systemLocale, createLocaleController } from '../src/i18n.js';
import { tr } from '../src/server/i18n.js';
import { createMcpHandler } from '../src/server/mcp.js';
import { createHost } from '../src/host.js';

test('both catalogs contain matching placeholders and preserve user-provided values literally', () => {
  const slots = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const [key, entry] of Object.entries(messages)) {
    assert.ok(entry.en && entry['zh-CN'], key);
    assert.deepEqual(slots(entry.en), slots(entry['zh-CN']), key);
  }
  const text = '<tag>{method}$&';
  assert.equal(createI18n('zh').t('navigationFailed', { detail: text }), `导航失败：${text}`);
  assert.equal(normalizeLocale('zh_TW.UTF-8'), 'zh-CN');
  assert.equal(normalizeLocale('fr-FR'), 'en');
  assert.equal(systemLocale({LANG:'zh_CN.UTF-8', LC_ALL:'C'}), 'en');
  assert.equal(systemLocale({LANG:'en_US.UTF-8', LC_MESSAGES:'zh_CN.UTF-8'}), 'zh-CN');
});

test('page locale follows Codex and ignores browser language and saved overrides', () => {
  const controller = createLocaleController({navigator:{language:'zh-CN'},localStorage:{getItem(){assert.fail('must not read saved preferences');}}});
  assert.equal(controller.i18n.locale, 'en');
  controller.setHostLocale('zh-CN');
  assert.equal(controller.i18n.locale, 'zh-CN');
  controller.setHostLocale('en-US');
  assert.equal(controller.i18n.locale, 'en');
  controller.setHostLocale('fr-FR');
  assert.equal(controller.i18n.locale, 'en');
  controller.setHostLocale(null);
  assert.equal(controller.i18n.locale, 'en');
  assert.equal(createLocaleController({openai:{locale:'zh-CN'},navigator:{language:'en'}}).i18n.locale,'zh-CN');
});

test('concurrent MCP requests keep independent error languages throughout async work', async () => {
  const handler = createMcpHandler({html:'',uri:'ui://test',host:{async snapshot(){await new Promise(r=>setImmediate(r));throw Error(tr('unknownTrust'));}}});
  const [english, chinese] = await Promise.all(['en', 'zh-CN'].map(locale => handler('tools/call', {name:'open_worktree_navigator', arguments:{action:'snapshot',locale}})));
  assert.equal(english.isError, true);
  assert.equal(chinese.isError, true);
  assert.match(english.content[0].text, /Could not verify/);
  assert.match(chinese.content[0].text, /无法核实/);
  await assert.rejects(handler('tools/call', {name:'open_worktree_navigator',arguments:{locale:'fr'}}), {code:-32602});
});

test('MCP session validation uses the requested language without connecting to the host', async () => {
  const handler = createMcpHandler({html:'',uri:'ui://test',host:createHost({connect(){assert.fail('must validate before connecting');}})});
  for (const locale of ['en','zh-CN']) {
    const result = await handler('tools/call', {name:'create_worktree_session',arguments:{locale,projectId:'p',worktreePath:'/extra',requestId:'bad'}});
    assert.equal(result.isError,true);
    assert.equal(result.content[0].text,createI18n(locale).t('invalidCreation'));
  }
});
