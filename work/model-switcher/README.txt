Codex-DeepSeek-Handoff desktop model switcher
============================

This folder contains the provider-facing Windows helpers. It is installed by
`work/thread-localizer/launcher/install.ps1`; it does not contain a real API
key. The encrypted key file is created only on the user's machine and is
ignored by Git.

Desktop shortcut:
  The user-created DeepSeek shortcut (currently named DeepSeek.lnk)

Normal GPT entry:
  Use the standard Codex icon pinned to the Windows taskbar.

DeepSeek-to-GPT handoff entry:
  Use the desktop shortcut named 任务交接GPT. It waits for the whole handoff
  batch to finish and opens Codex only when no task is blocked or failed.
  The first click shows a short notice; repeated clicks while it is working are
  ignored and cannot queue another handoff.

The DeepSeek shortcut and the standard taskbar Codex icon open the same
installed Codex desktop application. They do not open a terminal task picker.

DeepSeek shortcut:
  - model: deepseek-v4-flash (change the catalog and handoff settings together)
  - provider: https://api.deepseek.com/ using the Responses API
  - forced login method: API
  - default reasoning effort: max
  - web search request: live

After the DeepSeek Codex app fully exits, the hidden launcher automatically
restores GPT + ChatGPT login mode. Wait about 2-3 seconds, then the standard
taskbar Codex icon will open the normal GPT mode again.

Before switching, fully close the Codex desktop application. The launcher only
replaces the marked mode block in config.toml, validates the candidate config,
creates a timestamped backup, performs an atomic replacement, and opens the
same packaged Codex app.

The DeepSeek API key is encrypted for the current Windows user with DPAPI. The
provider asks get-deepseek-key.ps1 for the token when needed; the plaintext key
is not stored in config.toml or in either shortcut.

Before each provider switch, the launcher runs the batch handoff pipeline under
work/thread-localizer. That pipeline forks the current baton, preserves project
placement and visible context, and clears incompatible DeepSeek reasoning
content arrays when handing a task back to OpenAI.
