# Security policy

## Scope

This project operates on local Codex task state and invokes the locally
installed Codex app-server. It is not a hosted service and does not need a
project API key of its own.

## Do not disclose

Please remove credentials and private task data before filing an issue. In
particular, never attach `auth.json`, `*.dpapi`, API keys, rollout files,
`session_index.jsonl`, `state_5.sqlite`, or full handoff reports containing
conversation content.

## Report a vulnerability

For a security issue, use a private GitHub security advisory when the
repository is published. Until then, contact the maintainer privately rather
than posting credentials or task data in a public issue.

## Design safeguards

- The CLI validates the installed app-server schema before mutation.
- It creates a timestamped backup before a handoff and never edits the source
  SQLite database, session index, or source rollout directly.
- Dry-run reports precede task-state writes.
- The launcher uses a per-user lock to prevent duplicate handoffs.
