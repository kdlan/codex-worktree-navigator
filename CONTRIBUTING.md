# Contributing

Use Node.js 22+ and Git. There are no npm dependencies to install.

1. Describe the problem and expected behavior in an issue or pull request.
2. Keep changes focused and add tests for behavioral changes.
3. Run `npm test` and `npm run check`.
4. Update both README languages when installation or behavior changes.

Tests use isolated directories under `.agents/` and clean up their fixtures. The bundled Desktop CLI integration test is skipped when the supported app is unavailable. A passing simulated test does not establish host compatibility: changes to native interfaces also require testing in Codex Desktop and recording the host version in the pull request.

## Manual acceptance

- Install into an isolated Codex home and confirm unrelated MCP registrations survive upgrade and uninstall.
- Open Worktrees from Explore; verify loading, refresh, repository grouping, detached HEAD, and empty worktrees.
- Open an existing session. Create an empty session and one with a harmless first message; verify project identity, working directory, read-only permissions, and Desktop takeover.
- Verify errors for an unavailable App Server, untrusted repository, deleted worktree, and partial creation without blindly retrying a mutation.

## Release checklist

- Keep versions in package metadata, plugin metadata, and protocol client/server identification consistent (`npm run check` verifies this).
- Run tests and source/build checks; inspect `npm pack --dry-run --json --cache .agents/state/npm-cache` and the generated extension directory.
- Review all files selected for Git and distribution for credentials, company information, private URLs, personal paths, real session IDs, and logs. Use synthetic fixtures in tests.
- Keep `.agents/`, local profiles, configuration backups, and credentials out of Git. Do not attach local evidence without redaction.
- Preserve LICENSE in source and extension distributions. Keep `private: true` until npm publication is intentionally supported.
- Verify native UI behavior on the target host version and describe unverified environments explicitly.

Git hosting configuration is managed by repository owners. Before public release, enable private vulnerability reporting and secret scanning where available; protect the default branch with review and CI requirements. These settings are separate from the checked-in workflow.

Contributions are provided under the project's MIT license. Submit only material you have permission to contribute.

## README screenshots

`docs/preview.html` renders the production view and stylesheet with entirely fictional fixtures. It does not connect to Codex or read local project data. Serve the repository with a local static server, then open `/docs/preview.html?lang=en` or `/docs/preview.html?lang=zh-CN`. Capture the page at 1280 × 760 and save it to the matching file in `docs/screenshots/`.

Keep names, paths, IDs, titles, and timestamps synthetic. Verify both images visually before replacing them. Screenshots are included in the distribution so README image links remain valid.
