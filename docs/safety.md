# Safety and data boundaries

## What the project changes

The CLI creates a new target thread through the app-server protocol, writes its
own manifest/report files, and may normalize the newly created target rollout
after making a backup. The desktop launcher changes only its marked provider
block in `config.toml`, with a candidate parse and timestamped backup first.

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
rollouts, reports, backups, and encrypted key directory as private runtime
state. A Git commit cannot replace a timestamped task backup, and a task backup
cannot replace a Git commit.
