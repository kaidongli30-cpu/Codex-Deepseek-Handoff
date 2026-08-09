# Codex-DeepSeek-Handoff

Keep your DeepSeek conversation history when working in the Codex desktop app.

The project lets one logical task move from ChatGPT/OpenAI to the official
DeepSeek Responses API and back again. It preserves the task name, project
directory, visible messages, and handoff relationship. Before a DeepSeek task
is opened by OpenAI, incompatible reasoning `content` arrays are normalized to
`null`; linked web-search identifiers are normalized as well.

This is a local tool, not a hosted proxy or a replacement chat client. It uses
the Codex `app-server` shipped with the local installation, does not upload
conversation data to this repository, and never starts a model turn itself.

## Requirements

- Windows 10/11
- A working Codex desktop installation
- Node.js 18+
- PowerShell 7 recommended
- Your own official DeepSeek API access

API keys, DPAPI files, Codex databases, rollouts, and generated reports are
excluded from Git. Review `.gitignore` before publishing a fork.

## Install locally

Run from a checkout. First use `-WhatIf`; remove it only after reviewing the
planned copies.

```powershell
$repo = (Get-Location).Path
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File "$repo\work\thread-localizer\launcher\install.ps1" `
  -SourceRoot $repo -WhatIf

pwsh -NoProfile -ExecutionPolicy Bypass `
  -File "$repo\work\thread-localizer\launcher\install.ps1" `
  -SourceRoot $repo
```

The installer copies only the launcher, model catalog, handoff CLI, and
settings template into `%USERPROFILE%\.codex\model-switcher`. It does not move
task databases or launch Codex. Recreate the GPT handoff shortcut when needed:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File "$env:USERPROFILE\.codex\model-switcher\create-gpt-handoff-shortcut.ps1"
```

Use your existing DeepSeek shortcut for the reverse direction. Fully close the
Codex app before switching; the launcher opens it only after the handoff gate
passes.

## Test and dry-run

```powershell
npm test
npm run schema-check
npm run dry-run:deepseek
npm run dry-run:openai
```

The schema check does not start a model turn. A first real migration should use
`--only-task-id` for one-task acceptance before enabling the batch path.

See the [Chinese README](README.md), [architecture](docs/architecture.md),
[compatibility](docs/compatibility.md), [troubleshooting](docs/troubleshooting.md),
and [safety](docs/safety.md) guides for details.
