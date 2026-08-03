Codex desktop model switcher
============================

Desktop shortcut:
  Codex - DeepSeek - 选择已有任务

Normal GPT entry:
  Use the standard Codex icon pinned to the Windows taskbar.

Both shortcuts use the official `codex app` command to open the same installed
Codex desktop application. They do not open a terminal task picker.

DeepSeek shortcut:
  - model: deepseek-v4-flash
  - provider: https://api.deepseek.com/ using the Responses API
  - forced login method: API

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

Local project files and local Codex state stay under the same Windows account
and the same C:\Users\Lenovo\.codex directory. ChatGPT cloud-only tasks can be
hidden in API mode and are outside the scope of this first step.
