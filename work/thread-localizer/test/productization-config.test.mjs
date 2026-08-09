import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(toolRoot, "..", "..");

test("handoff settings keep the provider defaults required by the product", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(toolRoot, "data", "handoff-settings.json"), "utf8"));
  assert.equal(settings.managedProviders.deepseek.activeModel, "deepseek-v4-flash");
  assert.equal(settings.managedProviders.deepseek.modelPolicy, "global");
  assert.equal(settings.managedProviders.deepseek.reasoningEffort, "max");
  assert.equal(settings.managedProviders.deepseek.webSearch, "live");
  assert.equal(settings.managedProviders.openai.modelPolicy, "preserve-existing");
});

test("the desktop launcher is portable and keeps max reasoning plus live search", () => {
  const launcher = fs.readFileSync(path.join(toolRoot, "launcher", "codex-desktop-model-launcher.ps1"), "utf8");
  assert.doesNotMatch(launcher, /[A-Za-z]:\\Users\\[^\\]+\\Documents\\Codex/);
  assert.match(launcher, /CODEX_HANDOFF_ROOT/);
  assert.match(launcher, /Get-DeepSeekModeSetting 'reasoningEffort'/);
  assert.match(launcher, /Get-DeepSeekModeSetting 'webSearch'/);
});

test("the key helper resolves its secret beside the installed tool", () => {
  const helper = fs.readFileSync(path.join(repoRoot, "work", "model-switcher", "get-deepseek-key.ps1"), "utf8");
  assert.doesNotMatch(helper, /[A-Za-z]:\\Users\\[^\\]+\\\.codex/);
  assert.match(helper, /Join-Path\s+\$installRoot\s+'deepseek-api-key\.dpapi'/);
});

test("the bundled DeepSeek catalog defaults both supported models to max", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(repoRoot, "work", "model-switcher", "models-deepseek.json"), "utf8"));
  assert.deepEqual(
    catalog.models.filter((model) => model.slug.startsWith("deepseek-v4-")).map((model) => model.default_reasoning_level),
    ["max", "max"],
  );
});
