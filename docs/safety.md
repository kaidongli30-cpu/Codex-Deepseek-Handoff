# Safety and data boundaries

## What the project changes

The CLI creates a new target thread through the app-server protocol, writes its
own manifest/report files, and may normalize only the newly created target
rollout. The source remains intact until the target passes verification. The
desktop launcher changes only its marked provider block in `config.toml`, with
a candidate parse and small timestamped configuration backup first.

## What it does not change directly

- `state_5.sqlite`
- `session_index.jsonl`
- the source rollout of a task
- the user's prompts or model turns
- API keys or `auth.json`

The app-server itself remains the owner of task indexing and thread creation.

## Publishing checklist

Before making a repository public:

- run `git status --short` and inspect every staged path;
- run a credential scan for API-key prefixes, `auth.json`, DPAPI files, and
  private keys;
- remove personal icons or screenshots whose license is unclear;
- confirm reports, rollouts, SQLite files, and manifests are ignored;
- run `npm test` and PowerShell syntax checks;
- do not push until the repository name, license, and README are final.

## Real task data

Use the repository only for source and safe templates. Treat the Codex home,
rollouts, reports, and encrypted key directory as private runtime state. Task
history is not copied into cumulative backup directories. Successful handoffs
permanently delete the predecessor only after the replacement is verified;
Git protects source code, not local chat data.
