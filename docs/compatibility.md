# Compatibility matrix

| Component | Supported baseline | Notes |
| --- | --- | --- |
| Windows | Windows 10/11 | The desktop launcher and shortcut scripts are Windows-specific. |
| Codex | Current installed desktop build with `app-server` | The schema guard is authoritative; unsupported fields stop the handoff. |
| App-server | `initialize`, thread list/read/items, fork/start/inject, name set | `experimentalApi: true` is sent during initialization. |
| Node.js | 18 or newer | Used by the CLI and tests. |
| PowerShell | 7 recommended | The launcher can fall back to Windows PowerShell when necessary. |
| OpenAI | ChatGPT login mode | Existing task model is preserved when known. |
| DeepSeek | Official Responses API provider | The selected slug must exist in the local model catalog. |
| DeepSeek reasoning | `max` default | The launcher writes this value into its managed config block. |
| DeepSeek web search | `live` default | Provider/model support is still required; this setting only enables the request. |
| Images | Not provided by the handoff layer | Vision support depends on the selected provider model and Codex input path. |

## Version drift

Codex app-server is an evolving local protocol. Do not hand-edit a request to
match a guess. Run `npm run schema-check`; if the schema guard reports a
mismatch, preserve the report and stop before changing task state.

## Model changes

To move from `deepseek-v4-flash` to another official Responses API model, add
the exact provider slug to the local `models-deepseek.json`, validate its
supported capabilities, then change only `activeModel` in
`data/handoff-settings.json`. The next DeepSeek handoff creates a new baton;
existing OpenAI model memory is not overwritten.
