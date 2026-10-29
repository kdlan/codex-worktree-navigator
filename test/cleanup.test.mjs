import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHost} from '../src/host.js';
const exec=promisify(execFile);

test('cleanup protects data and main checkout, removes only a confirmed clean worktree, and retains its branch',async()=>{
  await mkdir('.agents/state',{recursive:true});
  const dir=await mkdtemp(resolve('.agents/state/cleanup-'));
  const repo=join(dir,'repo'),wt=join(dir,'linked space'),other=join(dir,'other');
  const git=(...args)=>exec('git',args);
  let loaded=false,known=true;
  try {
    await mkdir(repo);await git('-C',repo,'init','-b','main');
    await writeFile(join(repo,'tracked'),'initial');await writeFile(join(repo,'.gitignore'),'ignored\n');
    await git('-C',repo,'add','.');await git('-C',repo,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','fixture');
    await git('-C',repo,'worktree','add','-b','feature',wt);
    await mkdir(other);await git('-C',other,'init');
    const rpc=async(method,p)=>{
      if(method==='thread/loaded/list')return {data:loaded?['loaded-thread']:[]};
      if(method==='thread/read')return {thread:{cwd:wt}};
      assert.equal(method,'command/exec');
      assert.equal(p.sandboxPolicy.type,'readOnly');
      assert.ok(!(p.command[3]==='worktree' && p.command[4]==='remove'));
      try{return {...await exec(p.command[0],p.command.slice(1),{cwd:p.cwd}),exitCode:0};}
      catch(e){return {stdout:e.stdout,stderr:e.stderr,exitCode:e.code};}
    };
    const host=createHost({projects:async()=>[{path:known?repo:other}],connect:async fn=>fn(rpc)});
    let id=0;const clean=(path=wt,confirmed=true)=>host.cleanupWorktree({worktreePath:path,confirmed,requestId:`request-${++id}`});
    await assert.rejects(clean(wt,false));await assert.rejects(clean(repo));
    known=false;await assert.rejects(clean());known=true;
    await writeFile(join(wt,'tracked'),'changed');await assert.rejects(clean());await git('-C',wt,'restore','tracked');
    for(const file of ['untracked','ignored']){await writeFile(join(wt,file),'keep');await assert.rejects(clean());await access(join(wt,file));await rm(join(wt,file));}
    await git('-C',repo,'worktree','lock',wt);await assert.rejects(clean());await git('-C',repo,'worktree','unlock',wt);
    loaded=true;await assert.rejects(clean());loaded=false;
    // An unreferenced detached commit must first be preserved with a branch.
    await git('-C',wt,'checkout','--detach');await writeFile(join(wt,'tracked'),'detached');await git('-C',wt,'add','tracked');
    await git('-C',wt,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','detached');
    await assert.rejects(clean());await git('-C',wt,'branch','saved-detached');
    const args={worktreePath:wt,confirmed:true,requestId:'remove-once'};
    const [a,b]=await Promise.all([host.cleanupWorktree(args),host.cleanupWorktree(args)]);
    assert.equal(a.removed,true);assert.deepEqual(a,b);
    await assert.rejects(access(wt));await access(repo);
    await git('-C',repo,'show-ref','--verify','refs/heads/feature');await git('-C',repo,'show-ref','--verify','refs/heads/saved-detached');
    await host.cleanupWorktree(args);
    await assert.rejects(host.cleanupWorktree({...args,worktreePath:repo}));
  }finally{await rm(dir,{recursive:true,force:true});}
});
