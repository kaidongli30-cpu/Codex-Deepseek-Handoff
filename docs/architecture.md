# Architecture

## The handoff baton

The app-server exposes tasks as threads. The tool treats each logical task as
a baton recorded in a local manifest. A baton records the current thread ID,
provider, model, project `cwd`, and the source relationship used for the last
handoff. The manifest is a deduplication index; it is not a replacement for
Codex's task database.

```text
thread/list
   ↓
discoverLocalTasks + settings filters
   ↓
dry-run report (no writes)
   ↓
thread/fork
   ↓
optional normalization of the new target rollout
   ↓
thread/read(includeTurns=true) + thread/items/list
   ↓
manifest update and verified old baton delete
```

The implementation tries `thread/fork` first. If the installed protocol does
not expose that operation, it tries the documented rollout-path route, and only
then uses `thread/start` plus `thread/inject_items`. This order is deliberate:
forking keeps the server's own thread metadata and lineage intact.

## Provider boundary

OpenAI tasks use `preserve-existing`, so a task that previously used a selected
GPT model can return to that model. DeepSeek stores per-task model and reasoning
effort preferences, so a task can return to its last DeepSeek combination after
a GPT round trip. The configured `deepseek-v4-pro + max` combination is only the
fallback for tasks without DeepSeek history. Model catalog entries are checked
before the launcher opens Codex.

The desktop launcher is a gate around the CLI. It acquires a per-user lock,
waits for Codex to exit, runs the batch handoff, and opens the same desktop app
only when no task failed or remained blocked. It never sends a user prompt.

## Compatibility normalization

DeepSeek Responses records can contain reasoning `content` arrays that the
OpenAI task schema rejects. The normalizer changes only the newly forked
OpenAI target while the original source task still exists:

- reasoning `content` becomes `null`;
- DeepSeek web-search IDs are mapped from `call_*` to `ws_*` and matching
  `web_search_end.call_id` references are updated;
- ordinary function-call IDs are not changed;
- collisions and missing IDs stop the handoff instead of guessing.

## Schema guard and transaction boundary

Initialization declares `capabilities.experimentalApi = true`. The schema guard
uses the selected Codex executable, caches a versioned schema under the Codex
home, and records the executable signature and request-schema hash. A stale or
missing cache is regenerated; an incompatible protocol stops before mutation.

The tool does not copy the task database or rollouts into cumulative backup
directories. It leaves the source task untouched until the replacement has
passed provider, model, count, path, and compatibility checks. A failed target
is deleted through `thread/delete`; after success, the manifest points to the
replacement and the old source is deleted through the same official protocol.
The tool never updates `state_5.sqlite`, `session_index.jsonl`, or a source
rollout in place.
