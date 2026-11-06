import {mkdtemp,mkdir,writeFile,rm,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHistoryHost} from '../src/history-host.js';
import test from 'node:test';
import assert from 'node:assert/strict';
test('bundled server creates and persists a worktree session, protects it, then cleans an archived fixture', async t => {
try { await access('/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex'); } catch { t.skip('Requires bundled macOS server'); return; }
await mkdir('.agents/state', { recursive: true });
const previousHome = process.env.CODEX_HOME, previousCli = process.env.CODEX_CLI_PATH;
const dir=await mkdtemp(resolve('.agents/state/actions-')), repo=join(dir,'repo'),wt=join(dir,'linked'),home=join(dir,'home');
await mkdir(repo);await mkdir(home);process.env.CODEX_HOME=home;process.env.CODEX_CLI_PATH='/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
await writeFile(join(home,'config.toml'),`[projects.${JSON.stringify(repo)}]\ntrust_level = "trusted"\n`);
const git=(...args)=>execFileSync('git',args,{stdio:'pipe'});
git('-C',repo,'init','-b','main');await writeFile(join(repo,'file'),'fixture');git('-C',repo,'add','.');git('-C',repo,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture');git('-C',repo,'worktree','add','-b','fixture',wt);
async function server(work){const p=spawn(process.env.CODEX_CLI_PATH,['app-server','--listen','stdio://'],{env:process.env,stdio:['pipe','pipe','pipe']});p.stderr.resume();let id=0;const pending=new Map();const lines=createInterface({input:p.stdout});lines.on('line',l=>{const m=JSON.parse(l);const r=pending.get(m.id);if(r){pending.delete(m.id);m.error?r.reject(Error(m.error.message)):r.resolve(m.result)}});const timer=setTimeout(()=>{for(const r of pending.values())r.reject(Error('timeout'));p.kill()},30000);const rpc=(method,params)=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});p.stdin.write(JSON.stringify({id,method,params})+'\n')});try{await rpc('initialize',{clientInfo:{name:'navigator_fixture',version:'1'},capabilities:{experimentalApi:true}});p.stdin.write('{"method":"initialized"}\n');return await work(rpc)}finally{clearTimeout(timer);lines.close();p.kill();await new Promise(r=>p.once('exit',r));}}
try{
 const project=await server(rpc=>rpc('project/create',{name:'Navigator fixture',roots:[{path:repo}],idempotencyKey:'fixture-project'}));assert.ok(project.project.id);
 const host=createHistoryHost();const snap=await host.snapshot();assert.equal(snap.repositories.length,1);
 const projectId=snap.repositories[0].projectOptions[0].id;
 const result=await host.createSession({projectId,worktreePath:wt,requestId:'fixture-create',text:'Fixture draft; do not execute automatically.'});assert.equal(result.cwd,wt);assert.equal(result.projectId,projectId);
 const saved=await server(async rpc=>{const r=await rpc('thread/read',{threadId:result.threadId,includeTurns:false});const q=await rpc('thread/queue/list',{threadId:result.threadId});return {thread:r.thread,queue:q}});
 assert.equal(saved.thread.cwd,wt);assert.equal(saved.thread.projectId,projectId);assert.equal(saved.queue.data.length,1);
 const refreshed=await host.snapshot();assert.ok(refreshed.repositories[0].worktrees[0].threads.some(t=>t.id===result.threadId));
 await assert.rejects(host.cleanupWorktree({worktreePath:wt,confirmed:true,requestId:'blocked-clean'}),/unarchived/);await access(wt);
 await server(rpc=>rpc('thread/archive',{threadId:result.threadId}));
 const holder=spawn(process.execPath,['-e',"process.stdout.write('ready'); setInterval(()=>{},1000)"],{cwd:wt,stdio:['ignore','pipe','ignore']});
 try {
   await new Promise(resolve=>holder.stdout.once('data',resolve));
   await assert.rejects(host.cleanupWorktree({worktreePath:wt,confirmed:true,requestId:'occupied-clean'}),/using this worktree/);
 } finally {holder.kill();await new Promise(resolve=>holder.once('exit',resolve));}
 await writeFile(join(wt,'untracked'),'keep');
 await assert.rejects(host.cleanupWorktree({worktreePath:wt,confirmed:true,requestId:'dirty-clean'}));await access(join(wt,'untracked'));await rm(join(wt,'untracked'));
 assert.equal((await host.cleanupWorktree({worktreePath:wt,confirmed:true,requestId:'fixture-clean'})).removed,true);await assert.rejects(access(wt));
 await access(repo);git('-C',repo,'show-ref','--verify','refs/heads/fixture');
}finally{await rm(dir,{recursive:true,force:true});if(previousHome===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=previousHome;if(previousCli===undefined)delete process.env.CODEX_CLI_PATH;else process.env.CODEX_CLI_PATH=previousCli;}
});
