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
rollout by hand. The failed replacement is deleted while the source remains;
repeat the handoff from that source after inspecting the dry-run report.

## Web-search records fail after switching back

DeepSeek web-search calls can use `call_*` identifiers while OpenAI expects
`ws_*`. The normalizer updates the linked `web_search_end.call_id` values and
stops on collisions. Keep the original report when reporting a new shape; do
not delete records to make a task appear to load.

## The schema path is missing

The current implementation no longer depends on `C:\tmp`. Run
`npm run schema-check` with the same Codex installation that the shortcut will
open. It creates a versioned cache below `%USERPROFILE%\.codex\model-switcher`.
Use `CODEX_SCHEMA_ROOT` only when diagnosing a separately exported schema.

## The DeepSeek model is absent from the selector

Check that the slug in `data/handoff-settings.json` is present in the installed
`models-deepseek.json` and that the model advertises Responses API support.
Restarting the app alone does not repair a catalog typo.

## The installer says the official model catalog is missing

This repository does not redistribute DeepSeek's catalog or branded icon. Run
and test the official DeepSeek Codex setup first, then rerun this project's
installer. Do not create an empty `models-deepseek.json`: the launcher needs the
real catalog to validate the selected model before changing modes.

## Recovery

During a handoff, the source remains untouched until the replacement is fully
verified. A failed replacement is deleted. After a successful handoff the old
source is permanently deleted, so there is no accumulating task backup or
archived predecessor. Git rollback handles source-code changes only. See
[safety.md](safety.md) for the exact boundary.
