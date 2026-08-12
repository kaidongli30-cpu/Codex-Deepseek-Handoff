import fs from "node:fs/promises";
import { HANDOFF_SETTINGS_PATH } from "./constants.mjs";

export async function readHandoffSettings() {
  const settings = JSON.parse(await fs.readFile(HANDOFF_SETTINGS_PATH, "utf8"));
  if (settings?.version !== 1 || !settings.managedProviders || typeof settings.managedProviders !== "object") {
    throw new Error("handoff-settings.json 格式无效");
  }
  for (const [provider, config] of Object.entries(settings.managedProviders)) {
    if (!config?.activeModel || !["global", "preserve-existing"].includes(config.modelPolicy)) {
      throw new Error(`提供商 ${provider} 缺少 activeModel 或 modelPolicy 无效`);
    }
    if (config.reasoningPolicy && !["global", "preserve-existing"].includes(config.reasoningPolicy)) {
      throw new Error(`提供商 ${provider} 的 reasoningPolicy 无效`);
    }
  }
  return settings;
}

export function appServerProviderOverrides(provider, model, reasoningEffort = null, settings = null) {
  const providerSettings = settings?.managedProviders?.[provider] || null;
  const overrides = {
    model_provider: provider,
  };
  if (model) overrides.model = model;
  if (reasoningEffort) overrides.model_reasoning_effort = reasoningEffort;
  if (providerSettings?.forcedLoginMethod) {
    overrides.forced_login_method = providerSettings.forcedLoginMethod;
  } else if (provider === "deepseek") {
    overrides.forced_login_method = "api";
  } else if (provider === "openai") {
    overrides.forced_login_method = "chatgpt";
  }
  return overrides;
}

export function resolveTargetModel(settings, provider, task = null) {
  const providerSettings = settings.managedProviders?.[provider];
  if (!providerSettings) throw new Error(`未管理的目标提供商: ${provider}`);
  if (providerSettings.modelPolicy === "preserve-existing") {
    const remembered = task?.providerModels?.[provider];
    if (remembered) return remembered;
  }
  return providerSettings.activeModel;
}

export function resolveTargetReasoningEffort(settings, provider, task = null) {
  const providerSettings = settings.managedProviders?.[provider];
  if (!providerSettings) throw new Error(`未管理的目标提供商: ${provider}`);
  if (providerSettings.reasoningPolicy === "preserve-existing") {
    const remembered = task?.providerReasoningEfforts?.[provider];
    if (remembered) return remembered;
  }
  return providerSettings.reasoningEffort || null;
}

export function normalizeCwd(value) {
  if (!value) return null;
  return String(value).replace(/^\\\\\?\\/, "").replace(/[\\/]+$/, "");
}

export function mapProjectCwd(settings, value) {
  const normalized = normalizeCwd(value);
  if (!normalized) return null;
  const mappings = settings.projectMappings || {};
  const direct = mappings[normalized];
  if (direct) return normalizeCwd(direct);
  const match = Object.entries(mappings).find(([source]) => normalizeCwd(source)?.toLowerCase() === normalized.toLowerCase());
  return normalizeCwd(match?.[1] || normalized);
}
