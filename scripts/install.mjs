import { createI18n, systemLocale } from '../src/i18n.js';
const tr = createI18n(systemLocale(process.env)).t;
import { access, cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const name = 'worktree_navigator';
const options = process.argv.slice(2);
const values = new Map();
for (let i = 0; i < options.length; i++) {
  const flag = options[i];
  if (!['--app', '--codex-home', '--node', '--uninstall', '--help'].includes(flag)) throw Error(tr('unknownOption', {flag}));
  if (values.has(flag)) throw Error(tr('duplicateOption', {flag}));
  if (flag === '--help' || flag === '--uninstall') values.set(flag, true);
  else {
    const value = options[++i];
    if (!value || value.startsWith('--')) throw Error(tr('missingOption', {flag}));
    values.set(flag, resolve(value));
  }
}
if (values.has('--help')) {
  console.log(tr('usage'));
  process.exit(0);
}
const arg = flag => values.get(flag);
const home = arg('--codex-home') || (process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : join(homedir(), '.codex'));
const app = arg('--app') || '/Applications/ChatGPT.app';
const cli = join(app, 'Contents/Resources/codex-cli/bin/codex');
const node = arg('--node') || join(app, 'Contents/Resources/cua_node/bin/node');
const uninstall = values.has('--uninstall');
await access(cli, constants.X_OK);
if (!uninstall) await access(node, constants.X_OK);
const target = join(home, 'extensions/worktree-navigator');
const env = { ...process.env, CODEX_HOME: home };
try { const owned = JSON.parse(await readFile(join(target, 'installation.json'), 'utf8')); if (owned.name !== name) throw Error(tr('foreignInstall')); }
catch (e) { if (e.code !== 'ENOENT') throw e; try { await access(target); throw Error(tr('unmarkedInstall')); } catch (check) { if (check.code !== 'ENOENT') throw check; } }
const config = join(home, 'config.toml');
const backups = join(home, 'extensions/backups');
await mkdir(backups, { recursive: true });
let original = null;
try { original = await readFile(config); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = join(backups, `worktree-navigator-${stamp}.toml`);
if (original) await writeFile(backup, original, { mode: 0o600 });
let previous;
try { previous = JSON.parse((await exec(cli, ['mcp', 'get', name, '--json'], { env })).stdout); } catch (e) { if (!/No MCP server named/.test(e.stderr || '')) throw e; }
if (previous && !previous.transport?.args?.includes(join(target, 'src/server/mcp.js'))) throw Error(tr('foreignMcp', {name}));
try {
  if (uninstall) {
    if (previous) await exec(cli, ['mcp', 'remove', name], { env });
    await rm(target, { recursive: true, force: true });
    console.log(tr('uninstalled'));
  } else {
    const staging = target + '.installing';
    await rm(staging, { recursive: true, force: true });
    await cp(fileURLToPath(new URL('../dist/worktree-navigator/', import.meta.url)), staging, { recursive: true });
    await writeFile(join(staging, 'installation.json'), JSON.stringify({ name, version: JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version, node, cli }, null, 2));
    const old = target + '.previous'; await rm(old, { recursive: true, force: true });
    let moved = false;
    try { await rename(target, old); moved = true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    try {
      await rename(staging, target);
      await exec(cli, ['mcp', 'add', name, '--env', `CODEX_HOME=${home}`, '--', node, join(target, 'src/server/mcp.js')], { env });
      await rm(old, { recursive: true, force: true });
    } catch (e) { await rm(target, { recursive: true, force: true }); if (moved) await rename(old, target); throw e; }
    console.log(tr('installed'));
  }
} catch (e) {
  if (original) await writeFile(config, original, { mode: 0o600 });
  else await rm(config, { force: true });
  throw e;
}
console.log(original ? tr('backup', {path: backup}) : tr('configCreated'));
