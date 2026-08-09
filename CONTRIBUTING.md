# Contributing

Issues and pull requests are welcome. The project is intentionally local-first:
tests and dry runs must not send model requests or require a real API key.

## Before opening a change

1. Use Node.js 18 or newer and run `npm test` from the repository root.
2. If PowerShell files change, parse every `.ps1` file with PowerShell 7.
3. Run `git diff --check` and review the exact files staged for the commit.
4. Never include `auth.json`, API keys, DPAPI key files, Codex databases,
   rollout JSONL, or generated handoff reports.

Changes to the app-server request or response shapes must be accompanied by a
schema-compatibility test. If the installed schema does not match the expected
protocol, the tool must stop and report the mismatch rather than guessing.

## Commit and rollback practice

Keep commits small and descriptive. Before experimenting, record the current
commit with `git rev-parse HEAD`. A safe recovery is normally:

```powershell
git status
git revert --no-edit <bad-commit>
```

Use `git reset --hard <known-good-commit>` only when you explicitly intend to
discard uncommitted work and have first confirmed `git status`.
