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
  assert.equal(settings.managedProviders.openai.modelPolicy, "preserve-existing");
});

test("the desktop launcher is portable and keeps max reasoning plus live search", () => {
  const launcher = fs.readFileSync(path.join(toolRoot, "launcher", "codex-desktop-model-launcher.ps1"), "utf8");
  assert.doesNotMatch(launcher, /C:\\Users\\Lenovo\\Documents\\Codex/);
  assert.match(launcher, /CODEX_HANDOFF_ROOT/);
  assert.match(launcher, /model_reasoning_effort = "max"/);
  assert.match(launcher, /web_search = "live"/);
});

test("the key helper resolves its secret beside the installed tool", () => {
  const helper = fs.readFileSync(path.join(repoRoot, "work", "model-switcher", "get-deepseek-key.ps1"), "utf8");
  assert.doesNotMatch(helper, /C:\\Users\\Lenovo\\\.codex/);
  assert.match(helper, /Join-Path\s+\$installRoot\s+'deepseek-api-key\.dpapi'/);
});
