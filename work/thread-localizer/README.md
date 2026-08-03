# Codex multi-task provider handoff

This tool keeps local Codex desktop tasks usable while switching between the
ChatGPT/OpenAI provider and the official DeepSeek Responses API provider. It
uses the installed Codex `app-server` protocol and does not send model turns.

## Current design

Each logical task has a stable id in `data/batch-handoff-manifest.json`. The
manifest points to exactly one current baton (`currentThreadId`, provider, and
model). A provider switch processes every managed task independently:

1. discover all non-archived interactive tasks with `thread/list` and
   `modelProviders: []`;
2. auto-enroll new OpenAI and DeepSeek tasks;
3. generate a dry-run report before task-state writes;
4. fork each completed source task to the target provider/model;
5. preserve its name, project `cwd`, pin state, and remembered OpenAI model;
6. verify provider, model, thread source, project path, turn count, item count,
   and visible message count;
7. normalize DeepSeek reasoning records before an OpenAI task is opened;
8. archive the previous baton only after the replacement passes verification;
9. atomically update the task's manifest entry.

A failure or active turn blocks only that task. Other tasks continue through
the pipeline, and the launcher shows a summary plus the result report path.

The legacy single-task manifest remains as migration history. The active
single-task baton is imported once into the multi-task manifest and is not
forked merely because of the import.

## Project placement

Codex project grouping follows the task `cwd`. The pipeline preserves it. Add
an entry to `projectMappings` in `data/handoff-settings.json` only when an old
task needs to be moved to a canonical project directory.

## Provider and model configuration

`data/handoff-settings.json` is the single source of truth for active models.

- OpenAI uses `preserve-existing`, so a task that used Luna returns to Luna and
  a task that used Sol returns to Sol. A DeepSeek-originated task with no prior
  OpenAI model uses the configured OpenAI default.
- DeepSeek uses `global`, so changing `activeModel` upgrades all tracked tasks
  on their next DeepSeek handoff.

For a future DeepSeek model change, first add or confirm its exact API slug in
`C:\Users\Lenovo\.codex\model-switcher\models-deepseek.json`, then change only
`managedProviders.deepseek.activeModel` in `data/handoff-settings.json`. The
launcher refuses to start if the active slug is missing from the catalog.
Changing from one DeepSeek model to another is treated as a real handoff even
though the provider id is unchanged.

## Managed scope

The default managed providers are `openai` and `deepseek`. Tasks belonging to
older `custom` providers are listed in reports as `unmanaged-provider` and are
not changed. Archived, excluded, subagent, and test-mirror tasks are not
auto-enrolled.

## Commands

Run from `work/thread-localizer`:

```powershell
node src/cli.mjs schema-check
node src/cli.mjs batch-inventory
node src/cli.mjs batch-handoff-dry-run --target-provider deepseek
node src/cli.mjs batch-handoff-dry-run --target-provider openai
node src/cli.mjs batch-handoff --execute --target-provider deepseek
node src/cli.mjs batch-handoff --execute --target-provider openai
```

Use `--only-task-id <stable-or-current-id>` for a one-task acceptance test.
Dry-run and execution reports are written under `reports/`.

## Safety rules

- `capabilities.experimentalApi = true` is always declared at initialization.
- A task with an active turn or JSONL parse error is never forked.
- Every handoff creates a timestamped SQLite-consistent backup plus source
  rollout and session-index copies.
- The tool never edits `state_5.sqlite` or `session_index.jsonl` directly.
- Source rollouts are never modified.
- DeepSeek reasoning normalization modifies only the newly created OpenAI
  target rollout after copying that target to the handoff backup directory.
- No command in this pipeline starts a model response.
- The launcher controls desktop startup, but the migration CLI does not start
  or control the Codex UI.
