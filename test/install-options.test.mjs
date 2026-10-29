import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const exec = promisify(execFile);

test('installer rejects unknown, duplicate, and missing options before touching configuration', async () => {
  for (const [args, error] of [
    [['--codex-hmoe', '/unused'], /Unknown option/],
    [['--codex-home'], /Missing/],
    [['--uninstall', '--uninstall'], /Duplicate/],
  ]) {
    await assert.rejects(exec(process.execPath, ['scripts/install.mjs', ...args], {env:{...process.env,LC_ALL:'C'}}), error);
  }
  const help = await exec(process.execPath, ['scripts/install.mjs', '--help'], {env:{...process.env,LC_ALL:'C'}});
  assert.match(help.stdout, /Usage:/);
});

test('uninstall works after the bundled Node runtime has been removed', async () => {
  await mkdir('.agents/state', { recursive: true });
  const dir = await mkdtemp(resolve('.agents/state/uninstall-options-'));
  try {
    const app = join(dir, 'Test.app');
    const cliDir = join(app, 'Contents/Resources/codex-cli/bin');
    const home = join(dir, 'home');
    const target = join(home, 'extensions/worktree-navigator');
    await mkdir(cliDir, { recursive: true });
    await mkdir(target, { recursive: true });
    await writeFile(join(cliDir, 'codex'), `#!${process.execPath}\nprocess.stderr.write('No MCP server named'); process.exit(1);\n`, { mode: 0o700 });
    await writeFile(join(target, 'installation.json'), JSON.stringify({ name: 'worktree_navigator' }));
    await writeFile(join(home, 'config.toml'), '# unrelated configuration\n');
    await exec(process.execPath, ['scripts/install.mjs', '--app', app, '--codex-home', home, '--uninstall']);
    await assert.rejects(access(target));
    assert.equal(await readFile(join(home, 'config.toml'), 'utf8'), '# unrelated configuration\n');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('installer help and validation follow the terminal locale', async () => {
  const env = {...process.env, LC_ALL:'zh_CN.UTF-8'};
  const help = await exec(process.execPath, ['scripts/install.mjs','--help'], {env});
  assert.match(help.stdout, /用法/);
  await assert.rejects(exec(process.execPath, ['scripts/install.mjs','--unknown'], {env}), /未知选项/);
});
