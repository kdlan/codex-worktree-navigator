# Security

This experimental extension connects to the local Codex App Server. It reads project and session navigation metadata, runs fixed read-only Git queries, can create sessions and queue a user-supplied first message, and can remove a confirmed clean linked worktree using Git without force. Cleanup preserves branches and session records; it checks local changes, ignored files, locks, and sessions loaded in the connected App Server. The removal command runs directly in the MCP process with the current user’s permissions, without a shell. Stop other processes using the directory before confirming cleanup. Codex processes that message using the user's configured services. The extension does not collect telemetry or grant trust to directories.

## Reporting a vulnerability

Use the repository's private vulnerability reporting feature when enabled. If it is unavailable, open an issue asking maintainers for a private reporting channel, without including exploit details, credentials, private paths, or session data. No dedicated security email or response-time commitment is currently provided.

Include affected versions, a minimal synthetic reproduction, impact, and suggested mitigation in the private report. Security fixes target the current source version; older versions have no separate maintenance policy.

## Handling local data

`.agents/` may contain private development evidence, browser profiles, and logs. It is ignored by Git and excluded from distribution. Never publish the whole working directory as an archive. Review Git-selected files and package contents before release, and redact screenshots and logs before sharing them.

The App Server control socket and Codex configuration must remain accessible only to trusted local users. This project relies on version-specific host behavior; validate permissions and session creation again after host upgrades.
