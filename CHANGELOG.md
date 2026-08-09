# Changelog

All notable changes to this project are recorded here.

## Unreleased

- Prepared the project for a public, local-first release.
- Made the desktop launcher discover its handoff tool and model catalog from
  its installed location or explicit environment variables.
- Kept DeepSeek's default reasoning effort at `max` and web search at `live`.
- Added installer/uninstaller scripts, contributor and security guidance, and
  CI checks for Node tests and PowerShell syntax.
- Added idempotent first-run config bootstrap and both GPT/DeepSeek handoff
  desktop entries.
- Stopped redistributing the official DeepSeek model catalog and unverified
  branded icon; installation now reuses the official local setup.
- Added isolated install/uninstall CI coverage that preserves task manifests,
  reports, official provider files, and encrypted credentials.

## 0.1.0

- Added multi-task handoff through the Codex app-server protocol.
- Added dry-run reports, per-task manifests, backups, and provider-aware
  verification.
- Added DeepSeek-to-OpenAI normalization for reasoning `content: null` and
  linked web-search record identifiers.
