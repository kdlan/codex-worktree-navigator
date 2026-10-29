import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { Script } from 'node:vm';

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(join(dir, e.name)) : join(dir, e.name)))).flat();
}
for (const dir of ['src', 'scripts', 'test']) {
  for (const file of await files(dir)) {
    if (/\.m?js$/.test(file)) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  }
}
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const plugin = JSON.parse(await readFile('plugins/worktree-navigator/plugin.json', 'utf8'));
if (pkg.version !== plugin.version) throw Error('Plugin version must match package.json');
for (const file of ['src/server/mcp.js', 'src/server/app-server.js', 'src/native-client.js']) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/version: '([^']+)'/g)) {
    if (match[1] !== pkg.version) throw Error(`Version mismatch in ${file}`);
  }
}
for (const file of ['README.md', 'README.zh-CN.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md']) {
  if (!(await readFile(file, 'utf8')).trim()) throw Error(`Empty documentation: ${file}`);
}
execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
const html = await readFile('dist/worktree-navigator/page.html', 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
if (!script) throw Error('Missing bundled page script');
new Script(script, { filename: 'page.html' });
console.log('Source syntax, versions, documentation, and built page checks passed.');
