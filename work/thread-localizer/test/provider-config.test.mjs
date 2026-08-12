import assert from "node:assert/strict";
import test from "node:test";

import {
  appServerProviderOverrides,
  resolveTargetModel,
  resolveTargetReasoningEffort,
} from "../src/provider-config.mjs";

const settings = {
  managedProviders: {
    deepseek: {
      activeModel: "deepseek-v4-pro",
      modelPolicy: "preserve-existing",
      reasoningEffort: "max",
      reasoningPolicy: "preserve-existing",
    },
  },
};

test("new DeepSeek tasks default to Pro plus Max", () => {
  assert.equal(resolveTargetModel(settings, "deepseek", {}), "deepseek-v4-pro");
  assert.equal(resolveTargetReasoningEffort(settings, "deepseek", {}), "max");
});

test("DeepSeek handoff restores the task's last model and effort", () => {
  const task = {
    providerModels: { deepseek: "deepseek-v4-flash" },
    providerReasoningEfforts: { deepseek: "low" },
  };
  assert.equal(resolveTargetModel(settings, "deepseek", task), "deepseek-v4-flash");
  assert.equal(resolveTargetReasoningEffort(settings, "deepseek", task), "low");
});

test("app-server receives sticky model and reasoning overrides", () => {
  assert.deepEqual(
    appServerProviderOverrides("deepseek", "deepseek-v4-pro", "max"),
    {
      model_provider: "deepseek",
      model: "deepseek-v4-pro",
      model_reasoning_effort: "max",
      forced_login_method: "api",
    },
  );
});
