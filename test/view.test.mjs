import test from 'node:test';import assert from 'node:assert/strict';import {createView} from '../src/view.js';
// A small DOM fixture checks node identity and state without adding a UI dependency.
function fixture({captureWindow=()=>{}, ...overrides}={}){
  const dataKey=s=>s.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
  class Element extends EventTarget{
    constructor(tag){super();this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this._text='';this.hidden=false;this.style={};}
    set textContent(s){this._text=s;this.children=[];}get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
    append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
    replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
    setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k];}
    querySelectorAll(selector){const found=[];const visit=n=>{for(const c of n.children){const matches=selector.startsWith('[data-')?Object.hasOwn(c.dataset,dataKey(selector.slice(1,-1))):selector.startsWith('.')?c.className===selector.slice(1):c.tagName===selector;if(matches)found.push(c);visit(c);}};visit(this);return found;}
    querySelector(s){return this.querySelectorAll(s)[0]||null;}
    get options(){return this.children.filter(c=>c.tagName==='option');}
    showModal(){this.open=true;} focus(){}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
  }
  const document=Object.assign(new EventTarget(),{createElement:tag=>new Element(tag),head:new Element('head'),body:new Element('body'),documentElement:new Element('html'),activeElement:null,hidden:false});
  const win=Object.assign(new EventTarget(),{document,navigator:{language:'zh-CN'},openai:{locale:'zh-CN'},crypto:{randomUUID:()=>'request-1234'},localStorage:{getItem:()=>null,setItem(){}}});
  captureWindow(win);
  const view=createView({win,css:'',navigate:async()=>{},onRefresh(){},...overrides});return view;
}
test('initial loading lives on the refresh button without a loading notice or premature empty state',()=>{const v=fixture();try{const button=v.root.querySelector('[data-wtn-refresh]'),label=button.textContent;v.setBusy(true);assert.equal(button.disabled,true);assert.equal(button.getAttribute('aria-busy'),'true');assert.equal(button.textContent,label);assert.equal(v.root.querySelector('[data-wtn-notice]').hidden,true);assert.equal(v.root.querySelector('.wtn-empty'),null);v.setBusy(false);assert.equal(button.disabled,false);assert.equal(button.textContent,label);}finally{v.dispose();}});
test('refresh preserves existing repository nodes and inserts no status row',()=>{const v=fixture();try{v.render([{name:'Repo',mainRoot:'/repo',commonDir:'/repo/.git',worktrees:[]}]);const button=v.root.querySelector('[data-wtn-refresh]'),repo=v.root.querySelector('[data-wtn-repository]'),notice=v.root.querySelector('[data-wtn-notice]');const children=[...v.root.children];v.setBusy(true);v.setBusy(false);assert.equal(v.root.querySelector('[data-wtn-refresh]'),button);assert.equal(v.root.querySelector('[data-wtn-repository]'),repo);assert.deepEqual(v.root.children,children);assert.equal(notice.hidden,true);assert.equal(notice.textContent,'');}finally{v.dispose();}});
test('empty state appears only after a result, while errors remain explicit during retries',()=>{const v=fixture();try{v.render([]);assert.match(v.root.querySelector('.wtn-empty').textContent,/没有有效/);v.notice('连接失败');v.setBusy(true);const notice=v.root.querySelector('[data-wtn-notice]');assert.equal(notice.hidden,false);assert.equal(notice.textContent,'连接失败');v.setBusy(false);v.render([],['路径不可用']);assert.match(v.root.querySelector('[data-wtn-notice]').textContent,/部分路径/);}finally{v.dispose();}});

test('single create dialog handles empty and populated text and blocks double submit', async()=>{
 for(const text of ['', 'hello']) {
  const calls=[], links=[];let release;
  const v=fixture({createSession:args=>{calls.push(args);return new Promise(r=>{release=r;});},navigate:async url=>links.push(url)});
  v.render([{name:'Repo',commonDir:'/repo/.git',mainRoot:'/repo',projectOptions:[{id:'p',name:'Project'}],worktrees:[{root:'/extra',headRef:{type:'branch',string:'feature'},threads:[]}]}]);
  v.root.querySelector('.wtn-new').dispatchEvent(new Event('click'));
  const dialog=v.root.querySelector('dialog');dialog.querySelector('textarea').value=text;dialog.querySelector('select').value='p';
  const submit=dialog.querySelectorAll('button').at(-1);
  submit.dispatchEvent(new Event('click'));submit.dispatchEvent(new Event('click'));
  assert.equal(calls.length,1);assert.equal(calls[0].text,text);assert.equal(calls[0].worktreePath,'/extra');assert.equal(submit.disabled,true);
  v.render([]);assert.equal(v.root.querySelector('dialog'),dialog);
  release({threadId:'created'});await new Promise(r=>setImmediate(r));
  assert.deepEqual(links,['codex://threads/created']);assert.equal(v.root.querySelector('dialog'),null);v.dispose();
 }
});

test('host language updates translate buttons and labels while retaining the open draft', async () => {
  const {createI18n} = await import('../src/i18n.js');
  const i18n = createI18n('en');
  const v = fixture({i18n});
  try {
    assert.equal(v.root.querySelector('[data-wtn-refresh]').getAttribute('aria-label'), 'Refresh Worktrees');
    assert.equal(v.root.querySelector('.wtn-language'), null);
    v.render([{name:'Original repo',commonDir:'/repo/.git',mainRoot:'/repo',projectOptions:[{id:'p',name:'Original project'}],worktrees:[{root:'/extra',headRef:{type:'branch',string:'feature'},threads:[]}]}]);
    assert.equal(v.root.querySelector('.wtn-new').textContent, '+ New session');
    v.root.querySelector('.wtn-new').dispatchEvent(new Event('click'));
    const dialog = v.root.querySelector('dialog'), input = dialog.querySelector('textarea');
    input.value = ' keep my draft\n';
    assert.equal(dialog.querySelector('h2').textContent, 'New session');
    i18n.setLocale('zh-CN'); v.updateLocale();
    assert.equal(v.root.querySelector('dialog'), dialog);
    assert.equal(input.value, ' keep my draft\n');
    assert.equal(input.getAttribute('aria-label'), '首条聊天内容（可选）');
    assert.equal(dialog.querySelector('h2').textContent, '新建会话');
    dialog.querySelectorAll('button')[0].dispatchEvent(new Event('click'));
    assert.equal(v.root.querySelector('[data-wtn-refresh]').getAttribute('aria-label'), '刷新 Worktrees');
    assert.equal(v.root.querySelector('.wtn-language'), null);
    assert.match(v.root.textContent, /Original repo/);
  } finally { v.dispose(); }
});

test('language changes preserve pending submission and translate its busy and recovery actions', async () => {
  const {createI18n} = await import('../src/i18n.js');
  const i18n = createI18n('en'); let release, count = 0;
  const v = fixture({i18n,createSession:()=>{count++;return new Promise(r=>{release=r;});},navigate:async()=>{throw Error('native detail');}});
  try {
    v.render([{name:'Repo',commonDir:'/repo/.git',mainRoot:'/repo',projectOptions:[{id:'p',name:'Project'}],worktrees:[{root:'/extra',threads:[]}]}]);
    v.root.querySelector('.wtn-new').dispatchEvent(new Event('click'));
    const dialog = v.root.querySelector('dialog'), submit = dialog.querySelectorAll('button').at(-1);
    dialog.querySelector('textarea').value='hello';dialog.querySelector('select').value='p';
    submit.dispatchEvent(new Event('click'));
    assert.equal(submit.textContent,'Creating…');
    i18n.setLocale('zh-CN');v.updateLocale();
    assert.equal(submit.textContent,'正在创建…');assert.equal(submit.disabled,true);
    release({threadId:'created'});await new Promise(r=>setImmediate(r));
    assert.equal(submit.textContent,'打开已创建会话');assert.equal(submit.disabled,false);
    i18n.setLocale('en');v.updateLocale();
    assert.equal(submit.textContent,'Open created session');
    submit.dispatchEvent(new Event('click'));await new Promise(r=>setImmediate(r));
    assert.equal(count,1);
  } finally { v.dispose(); }
});

test('page initialization and Codex locale updates reach backend requests without a language selector', async () => {
  const {startNavigator} = await import('../src/index.js');
  let win; const seed=fixture({captureWindow:value=>{win=value;}}); seed.dispose();
  const calls=[];
  const respond = data => win.dispatchEvent(Object.assign(new Event('message'), {data, source:win.parent}));
  win.parent={postMessage(m){
    calls.push(m);if(m.id == null)return;
    const result=m.method==='ui/initialize'
      ? {hostContext:{locale:'en-US',theme:'dark'}}
      : {structuredContent:{repositories:[],errors:[]}};
    queueMicrotask(()=>respond({jsonrpc:'2.0',id:m.id,result}));
  }};
  const dispose=await startNavigator(win,'');
  try {
    assert.equal(win.document.documentElement.lang,'en');
    assert.equal(win.document.documentElement.style.colorScheme,'dark');
    assert.equal(calls.find(c=>c.method==='tools/call').params.arguments.locale,'en');
    assert.equal(win.document.body.querySelector('.wtn-language'),null);
    respond({jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params:{locale:'zh-CN'}});
    await new Promise(r=>setImmediate(r));
    assert.equal(win.document.documentElement.lang,'zh-CN');
    assert.equal(win.document.body.querySelector('[data-wtn-refresh]').getAttribute('aria-label'),'刷新 Worktrees');
    assert.equal(calls.filter(c=>c.method==='tools/call').at(-1).params.arguments.locale,'zh-CN');
    respond({jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params:{locale:'en'}});
    assert.equal(win.document.documentElement.lang,'en');
  } finally {dispose();}
});

test('cleanup requires confirmation, blocks duplicate submits, and refreshes after success',async()=>{
 let release;const calls=[],refreshes=[];
 const v=fixture({cleanupWorktree:args=>{calls.push(args);return new Promise(r=>{release=r;});},onRefresh:force=>refreshes.push(force)});
 try {
  const rows=[{name:'Repo',commonDir:'/repo/.git',mainRoot:'/repo',worktrees:[{root:'/extra',threads:[]}]}];
  v.render(rows);v.root.querySelector('.wtn-cleanup').dispatchEvent(new Event('click'));
  assert.equal(calls.length,0);
  v.root.querySelector('dialog').querySelectorAll('button')[0].dispatchEvent(new Event('click'));assert.equal(calls.length,0);
  v.root.querySelector('.wtn-cleanup').dispatchEvent(new Event('click'));
  const dialog=v.root.querySelector('dialog'),submit=dialog.querySelectorAll('button').at(-1);
  assert.match(dialog.textContent,/\/extra/);
  submit.dispatchEvent(new Event('click'));submit.dispatchEvent(new Event('click'));
  assert.equal(calls.length,1);assert.equal(calls[0].confirmed,true);assert.equal(calls[0].worktreePath,'/extra');
  assert.equal(submit.disabled,true);release({removed:true});await new Promise(r=>setImmediate(r));
  assert.equal(v.root.querySelector('dialog'),null);assert.deepEqual(refreshes,[true]);assert.equal(v.root.querySelector('.wtn-cleanup'),null);
 }finally{v.dispose();}
});
