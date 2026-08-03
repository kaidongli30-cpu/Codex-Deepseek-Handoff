import { atomicWriteJson, nowIso, pathExists, responseThread } from "./utils.mjs";
import { createAppServerClient, appServerErrorSummary } from "./appserver-client.mjs";
import { createTimestampedBackup } from "./backup.mjs";
import { DEFAULT_PROVIDER, DEEPSEEK_MODEL, DEEPSEEK_PROVIDER, MANIFEST_PATH, PROJECT_CWD, SOURCE_THREAD_ID, USER_THREAD_SOURCE } from "./constants.mjs";
import { buildMigrationPlan, defaultMirrorName, manifestProvider, readManifest } from "./migration-plan.mjs";
import { readRolloutMessages } from "./rollout-reader.mjs";
import { verifyThread } from "./verify-mirror.mjs";

function threadIdFromResult(result) {
  return responseThread(result)?.id || result?.threadId || result?.id || null;
}

async function tryForkById(client, plan) {
  try {
    const params = {
      threadId: plan.source.forkThreadId,
      cwd: plan.target.cwd,
      excludeTurns: false,
      deferGoalContinuation: true,
      threadSource: USER_THREAD_SOURCE,
    };
    if (plan.target.modelProvider) params.modelProvider = plan.target.modelProvider;
    if (plan.target.model) params.model = plan.target.model;
    const result = await client.request("thread/fork", params);
    return { result, method: "thread/fork by threadId" };
  } catch (error) {
    return { error, method: "thread/fork by threadId" };
  }
}

async function tryForkByPath(client, plan) {
  try {
    const params = {
      // The current schema still requires threadId even when path is supplied;
      // the server ignores it for the path-based branch.
      threadId: plan.source.forkThreadId,
      path: plan.source.rolloutPath,
      cwd: plan.target.cwd,
      excludeTurns: false,
      deferGoalContinuation: true,
      threadSource: USER_THREAD_SOURCE,
    };
    if (plan.target.modelProvider) params.modelProvider = plan.target.modelProvider;
    if (plan.target.model) params.model = plan.target.model;
    const result = await client.request("thread/fork", params);
    return { result, method: "thread/fork by rollout path" };
  } catch (error) {
    return { error, method: "thread/fork by rollout path" };
  }
}

async function fallbackStartAndInject(client, plan, items) {
  const params = {
    cwd: plan.target.cwd,
    ephemeral: false,
    historyMode: "paginated",
    threadSource: USER_THREAD_SOURCE,
  };
  if (plan.target.modelProvider) params.modelProvider = plan.target.modelProvider;
  if (plan.target.model) params.model = plan.target.model;
  const startResult = await client.request("thread/start", params);
  const mirrorThreadId = threadIdFromResult(startResult);
  if (!mirrorThreadId) throw new Error("thread/start 返回结果中没有镜像任务 ID");
  await client.request("thread/inject_items", { threadId: mirrorThreadId, items });
  return { mirrorThreadId, method: "thread/start + thread/inject_items" };
}

function providerConfig(targetProvider, targetModel) {
  if (targetProvider !== DEEPSEEK_PROVIDER) return {};
  return {
    model_provider: DEEPSEEK_PROVIDER,
    model: targetModel || DEEPSEEK_MODEL,
    forced_login_method: "api",
  };
}

export async function migrateOne({
  execute = false,
  targetProvider = DEFAULT_PROVIDER,
  targetModel = null,
  mirrorName = defaultMirrorName(targetProvider),
  forkThreadId = null,
  repairVisibility = false,
} = {}) {
  const manifest = await readManifest();
  const openaiEntry = manifest.migrations?.find((entry) => (
    entry.sourceThreadId === SOURCE_THREAD_ID && manifestProvider(entry) === DEFAULT_PROVIDER
  ));
  const existingProviderEntry = manifest.migrations?.find((entry) => (
    entry.sourceThreadId === SOURCE_THREAD_ID && manifestProvider(entry) === targetProvider
  ));
  const effectiveForkThreadId = forkThreadId || (repairVisibility
    ? existingProviderEntry?.mirrorThreadId
    : targetProvider === DEEPSEEK_PROVIDER ? openaiEntry?.mirrorThreadId : SOURCE_THREAD_ID);
  if (!effectiveForkThreadId) {
    throw new Error("没有找到可作为 DeepSeek 镜像来源的 GPT 镜像任务");
  }
  const plan = await buildMigrationPlan({
    targetProvider,
    targetModel: targetModel || (targetProvider === DEEPSEEK_PROVIDER ? DEEPSEEK_MODEL : null),
    mirrorName,
    forkThreadId: effectiveForkThreadId,
    repairVisibility,
  });
  console.log(JSON.stringify({ type: "dry-run", plan }, null, 2));
  if (!execute) return { type: "dry-run", plan };
  if (!plan.safeToProceed) {
    throw new Error(repairVisibility
      ? "dry-run 未通过：存在 rollout 解析错误，或清单中没有可修复的同源镜像"
      : "dry-run 未通过：存在 rollout 解析错误或 migration-manifest 中已有同源镜像");
  }

  const backup = await createTimestampedBackup({ sourceRolloutPath: plan.source.rolloutPath });
  const client = await createAppServerClient({ cwd: PROJECT_CWD, configOverrides: providerConfig(plan.target.modelProvider, plan.target.model) });
  try {
    const sourceItems = (await readRolloutMessages(plan.source.rolloutPath)).items;
    let result = await tryForkById(client, plan);
    const attempts = [{ method: result.method, ok: Boolean(result.result), error: result.error ? appServerErrorSummary(result.error) : null }];
    if (!result.result) {
      result = await tryForkByPath(client, plan);
      attempts.push({ method: result.method, ok: Boolean(result.result), error: result.error ? appServerErrorSummary(result.error) : null });
    }

    let mirrorThreadId;
    let method;
    if (result.result) {
      mirrorThreadId = threadIdFromResult(result.result);
      method = result.method;
      if (!mirrorThreadId) throw new Error(`${method} 返回结果中没有镜像任务 ID`);
    } else {
      const fallback = await fallbackStartAndInject(client, plan, sourceItems);
      mirrorThreadId = fallback.mirrorThreadId;
      method = fallback.method;
      attempts.push({ method, ok: true, error: null });
    }

    await client.request("thread/name/set", { threadId: mirrorThreadId, name: plan.target.mirrorName });
    const verification = await verifyThread(client, mirrorThreadId);
    const manifest = await readManifest();
    const entry = {
      sourceThreadId: plan.source.threadId,
      forkThreadId: plan.source.forkThreadId,
      mirrorThreadId,
      sourceName: plan.source.expectedName,
      mirrorName: plan.target.mirrorName,
      targetProvider: plan.target.modelProvider,
      targetModel: plan.target.model,
      threadSource: plan.target.threadSource,
      cwd: plan.target.cwd,
      method,
      migratedAt: nowIso(),
      sourceRolloutPath: plan.source.rolloutPath,
      sourceRolloutSha256: plan.source.rolloutSha256,
      sourceVisibleMessageCount: plan.source.visibleMessageCount,
      mirrorVisibleMessageCount: verification.visibleMessageCount,
      backupRoot: backup.backupRoot,
      attempts,
      visibilityRepair: repairVisibility
        ? {
            previousMirrorThreadId: existingProviderEntry.mirrorThreadId,
            reason: plan.visibilityRepair.reason,
          }
        : null,
    };
    const withoutSameSource = (manifest.migrations || []).filter((item) => (
      item.sourceThreadId !== plan.source.threadId || manifestProvider(item) !== plan.target.modelProvider
    ));
    await atomicWriteJson(MANIFEST_PATH, { version: 1, updatedAt: nowIso(), migrations: [...withoutSameSource, entry] });
    return { type: "migrated", plan, backup, entry, verification };
  } finally {
    await client.close();
  }
}
