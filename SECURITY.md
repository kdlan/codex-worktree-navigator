# Security

This experimental extension uses short-lived bundled Codex app-server connections to read projects and create persistent sessions. Browsing and creation have separate fixed RPC allowlists. Sessions start read-only with existing trust, and optional messages are queued without starting model execution. A read-only sqlite3 query reads only session navigation fields from the supported state_5.sqlite index, including empty and attached threads. The extension does not read credential files, collect telemetry, or grant trust.

Cleanup requires explicit confirmation and rejects main checkouts, unknown repositories, locked worktrees, unarchived stored sessions, open files reported by lsof, local changes including ignored files, and detached commits without a retaining branch. Git removal never uses force and keeps branches and session records. Missing or unsupported indexes and failed process inspection reject cleanup. These checks are not an atomic cross-application lock: stop tasks using the directory and avoid starting new work during cleanup. Independent server loaded-session state is never treated as Desktop state.

## Reporting a vulnerability

Use the repository's private vulnerability reporting feature when enabled. If it is unavailable, open an issue asking maintainers for a private reporting channel, without including exploit details, credentials, private paths, or session data. No dedicated security email or response-time commitment is currently provided.

Include affected versions, a minimal synthetic reproduction, impact, and suggested mitigation in the private report. Security fixes target the current source version; older versions have no separate maintenance policy.

## Handling local data

`.agents/` may contain private development evidence, browser profiles, and logs. It is ignored by Git and excluded from distribution. Never publish the whole working directory as an archive. Review Git-selected files and package contents before release, and redact screenshots and logs before sharing them.

The configured CLI executable and Codex configuration must remain accessible only to trusted local users. This project relies on version-specific host behavior; validate permissions and connection behavior again after host upgrades.
