import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';

test('real Git fixture has 4 worktrees, common-dir identity and a true detached HEAD', () => {
  const base = resolve('.agents/state'); mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, 'git-test-'));
  const repo = join(root, 'repo'); mkdirSync(repo);
  const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git(repo, 'init', '-b', 'main'); writeFileSync(join(repo, 'file.txt'), 'hello\n'); git(repo, 'add', 'file.txt');
    git(repo, '-c', 'user.name=Navigator Test', '-c', 'user.email=navigator@example.invalid', 'commit', '-m', 'fixture');
    const feature = join(root, 'feature space & #'); const detached = join(root, 'detached'); const fix = join(root, 'fix');
    git(repo, 'worktree', 'add', '-b', 'feature/router', feature);
    git(repo, 'worktree', 'add', '--detach', detached, 'HEAD');
    git(repo, 'worktree', 'add', '-b', 'fix', fix);
    const porcelain = git(repo, 'worktree', 'list', '--porcelain', '-z');
    assert.equal(porcelain.split('\0\0').filter(Boolean).length, 4);
    assert.match(porcelain, /branch refs\/heads\/feature\/router\0/);
    assert.match(porcelain, /detached\0/);
    const common = git(repo, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim();
    assert.equal(git(feature, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim(), common);
    assert.equal(git(detached, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim(), common);
    assert.equal(git(detached, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'HEAD');
    assert.equal(realpathSync(repo), repo);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createHost } from '../src/host.js';
import { parseWorktrees } from '../src/server/git.js';
const execAsync = promisify(execFile);

test('porcelain NUL parser preserves unusual paths, slash branches, locks and prunable records', () => {
  const records = parseWorktrees('worktree /repo\0HEAD abc\0branch refs/heads/main\0\0worktree /linked space\nline\0HEAD def\0detached\0locked reason\0\0worktree /deleted\0HEAD 000\0prunable missing\0\0');
  assert.equal(records.length, 3); assert.equal(records[1].root, '/linked space\nline'); assert.equal(records[1].headRef.type, 'detached'); assert.equal(records[1].locked, 'reason'); assert.equal(records[2].prunable, 'missing');
});

test('native backend validates 20 real repositories, groups extras and refreshes after deletion', async () => {
  const base = resolve('.agents/state'); mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, 'native-git-test-'));
  const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const projects = [];
    for (let i = 0; i < 20; i++) { const path = join(dir, 'repo'+i); mkdirSync(path); git(path,'init','-b','main'); projects.push({path,name:'Repo '+i}); }
    for (const p of projects.slice(0,2)) { writeFileSync(join(p.path,'file'),'fixture');git(p.path,'add','file');git(p.path,'-c','user.name=Navigator Test','-c','user.email=navigator@example.invalid','commit','-m','fixture'); }
    const feature = join(dir, 'feature & space'), detached = join(dir,'detached'), empty = join(dir,'empty'), other = join(dir,'other');
    git(projects[0].path,'worktree','add','-b','feature/router',feature);git(projects[0].path,'worktree','add','--detach',detached,'HEAD');git(projects[0].path,'worktree','add','-b','empty',empty);git(projects[1].path,'worktree','add','-b','other',other);
    mkdirSync(join(feature,'sub'));const alias=join(dir,'alias');const { symlinkSync }=await import('node:fs');symlinkSync(feature,alias);
    let queries = 0;
    const rpc = async (method,p) => {
      if (method==='command/exec') { assert.equal(p.command[0],'git');assert.ok(['rev-parse','worktree','status'].includes(p.command[3]));assert.equal(p.sandboxPolicy.type,'readOnly');try {const r=await execAsync(p.command[0],p.command.slice(1),{cwd:p.cwd,env:{...process.env,...p.env}});return{...r,exitCode:0};}catch(e){return{exitCode:e.code,stdout:e.stdout,stderr:e.stderr}} }
      if (method==='project/list') return {data:projects.map((p,i)=>({id:'project-'+i,name:p.name,roots:[{path:p.path}]})),nextCursor:null};
      assert.equal(method,'thread/list');queries++;assert.ok(p.sourceKinds.includes('appServer'));
      return {data:p.archived?[{id:'archived',cwd:feature,updatedAt:0}]:[{id:'one',cwd:join(feature,'sub'),updatedAt:2},{id:'two',cwd:alias,updatedAt:3},{id:'detached',cwd:detached,updatedAt:1},{id:'unrelated',cwd:projects[19].path,updatedAt:4},{id:'main-session',cwd:projects[0].path,updatedAt:5}],nextCursor:null};
    };
    const host=createHost({projects:async()=>projects,connect:fn=>fn(rpc)});
    let result=await host.snapshot();assert.equal(result.errors.length,0);assert.equal(result.repositories.length,2);
    const repo=result.repositories.find(r=>r.mainRoot===projects[0].path);assert.equal(repo.worktrees.length,3);
    const f=repo.worktrees.find(w=>w.root===feature);assert.deepEqual(f.threads.map(t=>t.id),['two','one','archived']);
    assert.equal(repo.worktrees.find(w=>w.root===empty).threads.length,0);assert.equal(repo.worktrees.find(w=>w.root===detached).headRef.type,'detached');assert.equal(queries,2);
    rmSync(detached,{recursive:true,force:true});result=await host.snapshot();assert.equal(result.repositories.find(r=>r.mainRoot===projects[0].path).worktrees.length,2);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
