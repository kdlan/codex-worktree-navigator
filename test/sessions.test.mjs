import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorktreeSession} from '../src/server/sessions.js';
function fixture({trust='trusted',release=true,failRestore=false,owner=true}={}) {
 const calls=[]; const thread={id:'test-thread',projectId:'project',cwd:'/extra'};
 const git={metadata:async p=>({root:p,commonDir:owner||p!=='/repo'?'/repo/.git':'/other/.git'}),worktrees:async()=>[{root:'/repo'},{root:'/extra'}]};
 const rpc=async(method,params)=>{calls.push([method,params]);switch(method){
 case 'project/read':return {project:{id:'project',roots:[{path:'/repo'}]}};
 case 'config/read':return {layers:[{name:{type:'user'},config:{projects:{'/repo':{trust_level:trust}}}}]};
 case 'thread/start':return {thread,cwd:'/extra'};
 case 'thread/unarchive':if(failRestore)throw Error('restore failed');return {thread};
 case 'thread/loaded/list':return {data:release?[]:['test-thread']};
 default:return {};
 }};
 return {calls,run:(text='')=>createWorktreeSession({rpc,git,projectId:'project',worktreePath:'/extra',text,requestId:'request-123',canonicalize:async p=>p})};
}
test('empty creation persists permissions and releases before navigation without trust writes',async()=>{
 const f=fixture();assert.equal((await f.run(' \n')).threadId,'test-thread');
 assert.deepEqual(f.calls.map(c=>c[0]),['project/read','config/read','thread/start','thread/name/set','thread/settings/update','thread/archive','thread/unarchive','thread/loaded/list']);
 assert.equal(f.calls.find(c=>c[0]==='thread/start')[1].sandbox,'read-only');
 assert.deepEqual(f.calls.find(c=>c[0]==='thread/settings/update')[1].sandboxPolicy,{type:'readOnly'});
});
test('message is queued only after owner release, preserving exact text',async()=>{
 const f=fixture();await f.run(' hello\n');const names=f.calls.map(c=>c[0]);assert.ok(names.indexOf('thread/loaded/list')<names.indexOf('thread/queue/add'));assert.equal(f.calls.at(-1)[1].input[0].text,' hello\n');
});
test('untrusted original project and foreign project never create threads',async()=>{
 for(const opts of [{trust:'untrusted'},{owner:false}]){const f=fixture(opts);await assert.rejects(f.run());assert.ok(!f.calls.some(c=>c[0]==='thread/start'));}
});
test('release and restore failures never send a message and include recovery thread id',async()=>{
 for(const opts of [{release:false},{failRestore:true}]){const f=fixture(opts);await assert.rejects(f.run('hi'),/test-thread/);assert.ok(!f.calls.some(c=>c[0]==='thread/queue/add'));}
});
