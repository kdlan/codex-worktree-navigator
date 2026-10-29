import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,access} from 'node:fs/promises';import{resolve,join}from'node:path';import{execFile}from'node:child_process';import{promisify}from'node:util';
const exec=promisify(execFile);const cli='/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
test('official CLI installation, upgrade and uninstall preserve unrelated configuration',async t=>{
  try{await access(cli)}catch{t.skip('Requires the supported macOS Desktop CLI');return}
  await mkdir('.agents/state',{recursive:true});const home=await mkdtemp(resolve('.agents/state/install-regression-'));
  try{
    await writeFile(join(home,'config.toml'),'[mcp_servers.keep_me]\ncommand = "keep-command"\nargs = []\n');
    await exec(process.execPath,['scripts/build.mjs']);
    const install=()=>exec(process.execPath,['scripts/install.mjs','--codex-home',home]);
    await install();await install();
    const config=await readFile(join(home,'config.toml'),'utf8');assert.match(config,/keep-command/);assert.equal((config.match(/\[mcp_servers\.worktree_navigator\]/g)||[]).length,1);
    const registered=JSON.parse((await exec(cli,['mcp','get','worktree_navigator','--json'],{env:{...process.env,CODEX_HOME:home}})).stdout);assert.equal(registered.enabled,true);assert.equal(registered.transport.type,'stdio');
    await exec(registered.transport.command,['--check',registered.transport.args[0]]);
    assert.match(await readFile(join(home,'extensions/worktree-navigator/page.html'),'utf8'),/ui\/notifications\/initialized/);
    await exec(process.execPath,['scripts/install.mjs','--codex-home',home,'--uninstall']);
    const after=await readFile(join(home,'config.toml'),'utf8');assert.match(after,/keep-command/);assert.doesNotMatch(after,/mcp_servers\.worktree_navigator/);
    await assert.rejects(access(join(home,'extensions/worktree-navigator')));
  }finally{await rm(home,{recursive:true,force:true})}
});
