import { execFileSync } from 'node:child_process';
const [pack] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--cache', '.agents/state/npm-cache'], { encoding: 'utf8' }));
const allowed = /^(?:docs\/screenshots\/worktrees-(?:en|zh-CN)\.png$|docs\/preview\.html$|src\/(?:server\/)?[a-z0-9-]+\.(?:js|css)$|test\/[a-z0-9-]+\.test\.mjs$|plugins\/worktree-navigator\/plugin\.json$|scripts\/(?:build|install|check|check-package)\.mjs$|package\.json$|README(?:\.zh-CN)?\.md$|LICENSE$|CONTRIBUTING\.md$|SECURITY\.md$)/;
for (const file of pack.files) {
  if (!allowed.test(file.path)) throw Error(`Unexpected distribution file: ${file.path}`);
}
for (const path of ['LICENSE', 'README.md', 'README.zh-CN.md', 'scripts/build.mjs', 'scripts/install.mjs', 'docs/screenshots/worktrees-en.png', 'docs/screenshots/worktrees-zh-CN.png', 'docs/preview.html']) {
  if (!pack.files.some(f => f.path === path)) throw Error(`Missing distribution file: ${path}`);
}
console.log(`Distribution allowlist passed (${pack.files.length} files).`);
