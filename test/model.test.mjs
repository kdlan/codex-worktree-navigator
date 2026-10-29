import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePath, containsPath, worktreeLabel, buildTree, threadLink, paginate, mapLimit } from '../src/model.js';

test('absolute path normalization preserves case, separators and Unicode boundaries', () => {
  assert.equal(normalizePath('/Users/Me/r/../repo//sub/'), '/Users/Me/repo/sub');
  assert.equal(normalizePath('/a/e\u0301'), '/a/é');
  assert.equal(normalizePath('relative'), null);
  assert.equal(normalizePath('/x\0y'), null);
  assert.equal(containsPath('/repo', '/repository'), false);
  assert.equal(containsPath('/repo', '/repo/sub'), true);
});

test('branch and detached labels use current headRef, including slash branches', () => {
  assert.equal(worktreeLabel({ headRef: { type: 'branch', string: 'feature/router' } }), 'feature/router');
  assert.equal(worktreeLabel({ headRef: { type: 'detached', sha: 'a1b2c3d4' } }), 'detached HEAD · a1b2c3d');
});

test('existing-thread deep links encode IDs exactly once', () => {
  assert.equal(threadLink('id/#?'), 'codex://threads/id%2F%23%3F');
  assert.throws(() => threadLink(''));
});

test('three-level grouping handles 4 worktrees, aliases, descendants, detached and removed history', () => {
  const repo = { root: '/repo', mainRoot:'/repo', commonDir: '/repo/.git', worktrees: [
    { exists:true, root: '/repo', headRef: { type: 'branch', string: 'main' } },
    { exists:true, root: '/wt/feature', headRef: { type: 'branch', string: 'feature/router' } },
    { exists:true, root: '/wt/detached', headRef: { type: 'detached', sha: 'abcdef0123' } },
    { exists:true, root: '/wt/fix', headRef: { type: 'branch', string: 'fix' } },
  ] };
  const metadata = new Map([
    ['/wt/feature/sub', { exists:true, root: '/wt/feature', commonDir: '/repo/.git' }],
    ['/symlink', { exists:true, root: '/wt/feature', commonDir: '/repo/.git' }],
    ['/repo', { root: '/repo', commonDir: '/repo/.git' }],
  ]);
  const threads = [
    { id: 'older', cwd: '/wt/feature/sub/', updatedAt: 1, gitInfo: { branch: 'old-source' } },
    { id: 'newer', cwd: '/symlink', updatedAt: 3 },
    { id: 'gone', cwd: '/wt/deleted', updatedAt: 2, archived: true },
    { id: 'prefix', cwd: '/repository', updatedAt: 1 },
  ];
  const tree = buildTree({ projects: [{ path: '/repo', name: 'My repo' }], repositories: [repo], metadata, threads });
  assert.equal(tree[0].name, 'My repo');
  assert.equal(tree[0].worktrees.length, 3);
  const feature = tree[0].worktrees.find(w => w.root === '/wt/feature');
  assert.deepEqual(feature.threads.map(t => t.id), ['newer', 'older']);
  assert.equal(worktreeLabel(feature), 'feature/router');
  assert.equal(tree.length, 1);
  assert.equal(tree.flatMap(r => r.worktrees.flatMap(w => w.threads)).length, 2);
  assert.equal(tree[0].worktrees.find(w=>w.root==='/wt/fix').threads.length,0);
});

test('common directories distinguish repositories with identical folder names', () => {
  const repositories = ['/a/repo', '/b/repo'].map(root => ({ root, commonDir: `${root}/.git`, mainRoot: root+'/main', worktrees: [{ exists:true, root, headRef: { type: 'branch', string: 'main' } }] }));
  const tree = buildTree({ projects: [], repositories, metadata: new Map(), threads: [{ id: 'a', cwd: '/a/repo/sub', updatedAt: 1 }] });
  assert.equal(tree.find(r => r.root === '/a/repo').worktrees[0].threads.length, 1);
  assert.equal(tree.find(r => r.root === '/b/repo').worktrees[0].threads.length, 0);
});

test('pagination covers all pages, explicit sources and deduplicates overlapping IDs', async () => {
  const calls = [];
  const rows = await paginate(async p => { calls.push(p); return p.cursor == null ? { data: [{ id: 'a', cwd: '/r' }], nextCursor: 'next' } : { data: [{ id: 'a', cwd: '/r' }, { id: 'b', cwd: '/r' }], nextCursor: null }; }, { sourceKinds: ['appServer'], limit: 1 });
  assert.equal(rows.length, 2);
  assert.equal(calls[1].cursor, 'next');
  assert.deepEqual(calls[1].sourceKinds, ['appServer']);
});

test('pagination rejects failed, malformed, cyclic and aborted results', async () => {
  await assert.rejects(paginate(async () => null, {}), /Invalid/);
  await assert.rejects(paginate(async () => ({ data: [null] }), {}), /Invalid/);
  await assert.rejects(paginate(async () => ({ data: [], nextCursor: 'same' }), {}), /repeated/);
  await assert.rejects(paginate(async () => { throw Error('offline'); }, {}), /offline/);
  const c = new AbortController(); c.abort();
  await assert.rejects(paginate(async () => assert.fail('must not run'), {}, { signal: c.signal }));
});

test('bounded work queue limits concurrent Git discovery calls', async () => {
  let active = 0, peak = 0;
  const result = await mapLimit([1, 2, 3, 4, 5, 6], 2, async i => {
    active++; peak = Math.max(active, peak); await new Promise(r => setTimeout(r, 2)); active--; return i * 2;
  });
  assert.deepEqual(result, [2, 4, 6, 8, 10, 12]); assert.equal(peak, 2);
});

test('20 historical projects only display the 2 repositories with verified linked worktrees', () => {
  const projects = Array.from({length:20},(_,i)=>({path:`/repo${i}`,name:`Project ${i}`}));
  const repositories = projects.map((p,i)=>({root:p.path,mainRoot:p.path,commonDir:p.path+'/.git',worktrees:[
    {root:p.path,exists:true,headRef:{type:'branch',string:'main'}},
    ...(i<2?[{root:`/linked${i}`,exists:true,headRef:{type:'branch',string:'feature'}}]:[]),
    {root:`/deleted${i}`,exists:false,prunable:true,headRef:{type:'detached',sha:'123456789'}},
  ]}));
  const threads = projects.map((p,i)=>({id:String(i),cwd:p.path,updatedAt:1}));
  const tree = buildTree({projects,repositories,threads,metadata:new Map()});
  assert.deepEqual(tree.map(r=>r.name),['Project 0','Project 1']);
  assert.deepEqual(tree.map(r=>r.worktrees.length),[1,1]);
  assert.ok(tree.every(r=>r.worktrees[0].threads.length===0));
});

test('a session belongs to one longest-matching Worktree and repeated IDs are deduplicated',()=>{
  const r={root:'/main',mainRoot:'/main',commonDir:'/main/.git',worktrees:[
    {root:'/linked',exists:true,headRef:{type:'branch',string:'parent'}},
    {root:'/linked/child',exists:true,headRef:{type:'branch',string:'child'}}]};
  const t={id:'one',cwd:'/linked/child/sub',updatedAt:1};
  const tree=buildTree({projects:[],repositories:[r],threads:[t,t],metadata:new Map()});
  assert.equal(tree[0].worktrees.find(w=>w.root==='/linked').threads.length,0);
  assert.equal(tree[0].worktrees.find(w=>w.root==='/linked/child').threads.length,1);
});

test('explicitly unavailable session paths do not fall back to a parent Worktree',()=>{
  const tree=buildTree({projects:[],repositories:[{root:'/main',mainRoot:'/main',commonDir:'/main/.git',worktrees:[{exists:true,root:'/linked',headRef:{type:'branch',string:'x'}}]}],threads:[{id:'gone',cwd:'/linked/deleted'}],metadata:new Map([['/linked/deleted',null]])});
  assert.equal(tree[0].worktrees[0].threads.length,0);
});
