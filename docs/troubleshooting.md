# Troubleshooting

## The launcher opens no window

This is intentional when the handoff gate reports a failed or blocked task.
Open the JSON report path shown by the dialog and inspect the per-task result.
Fix the reported task or use `--only-task-id` for a controlled acceptance test;
do not repeatedly click the shortcut. The per-user lock makes extra clicks
no-ops while a handoff is running.

## `Invalid input[*].content ... maximum length 0`

This means an OpenAI target received a DeepSeek reasoning record with an array
content field. A current handoff normalizes newly created OpenAI targets to
`content: null`. If the error refers to an older target, do not edit the source
rollout by hand. Restore from the timestamped handoff backup or repeat the
handoff from the current provider baton after a dry run.

## Web-search records fail after switching back

DeepSeek web-search calls can use `call_*` identifiers while OpenAI expects
`ws_*`. The normalizer updates the linked `web_search_end.call_id` values and
stops on collisions. Keep the original report and backup when reporting a new
shape; do not delete the records to make a task appear to load.

## The schema path is missing

The current implementation no longer depends on `C:\tmp`. Run
`npm run schema-check` with the same Codex installation that the shortcut will
open. It creates a versioned cache below `%USERPROFILE%\.codex\model-switcher`.
Use `CODEX_SCHEMA_ROOT` only when diagnosing a separately exported schema.

## The DeepSeek model is absent from the selector

Check that the slug in `data/handoff-settings.json` is present in the installed
`models-deepseek.json` and that the model advertises Responses API support.
Restarting the app alone does not repair a catalog typo.

## Recovery

Keep the source task and its backup. Git rollback handles source-code changes;
the handoff backup handles local task data. See [safety.md](safety.md) and the
repository's `CONTRIBUTING.md` for the exact recovery boundaries.
