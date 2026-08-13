import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(toolRoot, "..", "..");

test("handoff settings keep the provider defaults required by the product", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(toolRoot, "data", "handoff-settings.json"), "utf8"));
  assert.equal(settings.managedProviders.deepseek.activeModel, "deepseek-v4-pro");
  assert.equal(settings.managedProviders.deepseek.modelAliases["deepseek-v4-pro"], "gpt-5.6-sol");
  assert.equal(settings.managedProviders.deepseek.modelAliases["deepseek-v4-flash"], "gpt-5.6-terra");
  assert.equal(settings.managedProviders.deepseek.modelPolicy, "preserve-existing");
  assert.equal(settings.managedProviders.deepseek.reasoningEffort, "max");
  assert.equal(settings.managedProviders.deepseek.reasoningPolicy, "preserve-existing");
  assert.equal(settings.managedProviders.deepseek.webSearch, "live");
  assert.equal(settings.managedProviders.openai.modelPolicy, "preserve-existing");
});

test("the desktop launcher is portable and keeps max reasoning plus live search", () => {
  const launcher = fs.readFileSync(path.join(toolRoot, "launcher", "codex-desktop-model-launcher.ps1"), "utf8");
  assert.doesNotMatch(launcher, /[A-Za-z]:\\Users\\[^\\]+\\Documents\\Codex/);
  assert.match(launcher, /CODEX_HANDOFF_ROOT/);
  assert.match(launcher, /Get-DeepSeekModeSetting 'reasoningEffort'/);
  assert.match(launcher, /Get-DeepSeekModeSetting 'webSearch'/);
  assert.match(launcher, /models-deepseek-picker\.json/);
  assert.match(launcher, /model-name-adapter\.mjs/);
  assert.match(launcher, /'low', 'high', 'max'/);
});

test("the key helper resolves its secret beside the installed tool", () => {
  const helper = fs.readFileSync(path.join(repoRoot, "work", "model-switcher", "get-deepseek-key.ps1"), "utf8");
  assert.doesNotMatch(helper, /[A-Za-z]:\\Users\\[^\\]+\\\.codex/);
  assert.match(helper, /Join-Path\s+\$installRoot\s+'deepseek-api-key\.dpapi'/);
});

test("the installer reuses the official catalog and installs both handoff entries", () => {
  const installer = fs.readFileSync(path.join(toolRoot, "launcher", "install.ps1"), "utf8");
  const shortcuts = fs.readFileSync(path.join(toolRoot, "launcher", "create-handoff-shortcuts.ps1"), "utf8");
  assert.match(installer, /找不到 DeepSeek 官方模型目录/);
  assert.doesNotMatch(installer, /Copy-FileChecked[^\n]+models-deepseek\.json/);
  assert.match(installer, /initialize-handoff\.ps1/);
  assert.match(installer, /移除旧版累计任务备份模块/);
  assert.match(shortcuts, /任务交接GPT\.lnk/);
  assert.match(shortcuts, /DeepSeek交接\.lnk/);
});

test("configuration bootstrap is marker-scoped and validates before writing", () => {
  const initializer = fs.readFileSync(path.join(toolRoot, "launcher", "initialize-handoff.ps1"), "utf8");
  assert.match(initializer, /Codex desktop model switcher: mode \(managed; do not edit\)/);
  assert.match(initializer, /\[model_providers\.deepseek\]/);
  assert.match(initializer, /Test-CandidateConfig -Candidate \$candidate/);
  assert.match(initializer, /config\..+before-handoff-install\.toml/);
});

test("handoff verifies replacements then deletes predecessors without cumulative task backups", () => {
  const handoff = fs.readFileSync(path.join(toolRoot, "src", "handoff-engine.mjs"), "utf8");
  const batch = fs.readFileSync(path.join(toolRoot, "src", "batch-handoff-engine.mjs"), "utf8");
  assert.doesNotMatch(handoff, /createTimestampedBackup/);
  assert.match(handoff, /client\.request\("thread\/delete"/);
  assert.doesNotMatch(batch, /archiveTestThread|thread\/archive/);
  assert.match(batch, /sourceDeleted: true/);
});
