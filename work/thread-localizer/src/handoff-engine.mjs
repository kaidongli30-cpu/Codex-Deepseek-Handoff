import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { createAppServerClient } from "./appserver-client.mjs";
import { createTimestampedBackup } from "./backup.mjs";
import {
  CODEX_HOME,
  DEEPSEEK_MODEL,
  DEEPSEEK_PROVIDER,
  HANDOFF_MANIFEST_PATH,
  HANDOFF_TEST_MANIFEST_PATH,
  PROJECT_CWD,
  USER_THREAD_SOURCE,
} from "./constants.mjs";
import { findRolloutPath } from "./rollout-reader.mjs";
import { loadAndValidateSchema } from "./schema-guard.mjs";
import { appServerProviderOverrides } from "./provider-config.mjs";
import { atomicWriteJson, nowIso, pathExists, readJsonl, responseThread, sha256File } from "./utils.mjs";
import { verifyThread } from "./verify-mirror.mjs";

export function stateRow(threadId) {
  const db = new DatabaseSync(`${CODEX_HOME}\\state_5.sqlite`, { readOnly: true });
  try {
    return db.prepare(`SELECT id, name, title, model_provider, model, cwd, rollout_path,
      thread_source, archived, is_pinned FROM threads WHERE id = ?`).get(threadId) || null;
  } finally {
    db.close();
  }
}

export async function rolloutState(threadId) {
  const rolloutPath = await findRolloutPath(threadId);
  if (!rolloutPath) throw new Error(`找不到任务 ${threadId} 的 rollout`);
  const parsed = await readJsonl(rolloutPath);
  let activeTurn = false;
  let reasoningContentArrayCount = 0;
  for (const record of parsed.records) {
    if (record.value?.type === "event_msg") {
      if (record.value.payload?.type === "task_started") activeTurn = true;
      if (["task_complete", "turn_aborted"].includes(record.value.payload?.type)) activeTurn = false;
    }
    if (record.value?.type === "response_item"
      && record.value.payload?.type === "reasoning"
      && Array.isArray(record.value.payload.content)) {
      reasoningContentArrayCount += 1;
    }
  }
  return {
    rolloutPath,
    rolloutSha256: await sha256File(rolloutPath),
    parseErrorCount: parsed.errors.length,
    activeTurn,
    reasoningContentArrayCount,
  };
}

async function normalizeOpenAIReasoningContent(threadId, backupRoot) {
  const rolloutPath = await findRolloutPath(threadId);
  if (!rolloutPath) throw new Error(`找不到任务 ${threadId} 的 rollout`);
  const parsed = await readJsonl(rolloutPath);
  if (parsed.errors.length > 0) {
    throw new Error(`无法清洗 ${threadId}：rollout 存在 ${parsed.errors.length} 个解析错误`);
  }
  let normalizedCount = 0;
  const normalizedRecords = parsed.records.map((record) => {
    const value = record.value;
    if (value?.type === "response_item"
      && value.payload?.type === "reasoning"
      && Array.isArray(value.payload.content)
      && value.payload.content.length > 0) {
      normalizedCount += 1;
      return { ...record, value: { ...value, payload: { ...value.payload, content: null } } };
    }
    return record;
  });
  if (normalizedCount === 0) {
    return {
      rolloutPath,
      normalizedCount: 0,
      backupPath: null,
      sha256After: await sha256File(rolloutPath),
    };
  }
  const backupPath = `${backupRoot}\\target-rollout-before-normalize.jsonl`;
  await fs.copyFile(rolloutPath, backupPath);
  const temporaryPath = `${rolloutPath}.normalize-${process.pid}.tmp`;
  const text = `${normalizedRecords.map((record) => JSON.stringify(record.value)).join("\n")}\n`;
  await fs.writeFile(temporaryPath, text, "utf8");
  await fs.rename(temporaryPath, rolloutPath);
  return {
    rolloutPath,
    normalizedCount,
    backupPath,
    sha256After: await sha256File(rolloutPath),
  };
}

async function readManifest(testMode) {
  const manifestPath = testMode ? HANDOFF_TEST_MANIFEST_PATH : HANDOFF_MANIFEST_PATH;
  if (!(await pathExists(manifestPath))) return { manifestPath, manifest: { version: 1, handoffs: [] } };
  return { manifestPath, manifest: JSON.parse(await fs.readFile(manifestPath, "utf8")) };
}

export async function buildHandoffPlan({
  sourceThreadId,
  targetProvider,
  targetModel = null,
  targetName = null,
  testMode = false,
  pinTarget = false,
  recordManifest = true,
}) {
  if (!sourceThreadId || !targetProvider) throw new Error("handoff 需要源任务和目标提供商");
  const schema = await loadAndValidateSchema();
  const sourceRollout = await rolloutState(sourceThreadId);
  const sourceClient = await createAppServerClient({ cwd: PROJECT_CWD });
  let sourceVerification;
  try {
    sourceVerification = await verifyThread(sourceClient, sourceThreadId);
  } finally {
    await sourceClient.close();
  }
  const sourceDatabase = stateRow(sourceThreadId);
  if (!sourceDatabase) throw new Error(`state_5.sqlite 中找不到源任务 ${sourceThreadId}`);
  const { manifestPath, manifest } = recordManifest
    ? await readManifest(testMode)
    : { manifestPath: null, manifest: { version: 1, handoffs: [] } };
  const existing = recordManifest
    ? (manifest.handoffs || []).find((entry) => (
        entry.sourceThreadId === sourceThreadId
        && entry.targetProvider === targetProvider
        && entry.sourceRolloutSha256 === sourceRollout.rolloutSha256
      )) || null
    : null;
  const plan = {
    generatedAt: nowIso(),
    testMode,
    manifestPath,
    source: {
      threadId: sourceThreadId,
      name: sourceVerification.name,
      provider: sourceDatabase.model_provider,
      model: sourceDatabase.model,
      cwd: sourceVerification.cwd,
      rolloutPath: sourceRollout.rolloutPath,
      rolloutSha256: sourceRollout.rolloutSha256,
      parseErrorCount: sourceRollout.parseErrorCount,
      activeTurn: sourceRollout.activeTurn,
      turnCount: sourceVerification.turnCount,
      itemCount: sourceVerification.itemCount,
      visibleMessageCount: sourceVerification.visibleMessageCount,
      isPinned: Boolean(sourceDatabase.is_pinned),
    },
    target: {
      provider: targetProvider,
      model: targetModel,
      name: targetName || sourceVerification.name || sourceDatabase.name || null,
      cwd: sourceVerification.cwd,
      threadSource: USER_THREAD_SOURCE,
      isPinned: pinTarget || Boolean(sourceDatabase.is_pinned),
      expectedReasoningNormalizations: targetProvider === "openai"
        ? sourceRollout.reasoningContentArrayCount
        : 0,
    },
    schema: {
      sha256: schema.schemaSha256,
      threadSourceField: schema.threadSourceField,
    },
    existingHandoff: existing ? { targetThreadId: existing.targetThreadId, handedOffAt: existing.handedOffAt } : null,
    safeToProceed: sourceRollout.parseErrorCount === 0 && !sourceRollout.activeTurn && !existing,
  };
  return plan;
}

export async function handoffOne(options) {
  const plan = await buildHandoffPlan(options);
  if (options.emitDryRun !== false) {
    console.log(JSON.stringify({ type: "handoff-dry-run", plan }, null, 2));
  }
  if (!options.execute) return { type: "handoff-dry-run", plan };
  if (!plan.safeToProceed) throw new Error("handoff dry-run 未通过：源任务正在运行、rollout 有错误，或相同交接已经执行");

  const backup = await createTimestampedBackup({ sourceRolloutPath: plan.source.rolloutPath });
  const client = await createAppServerClient({
    cwd: PROJECT_CWD,
    configOverrides: appServerProviderOverrides(plan.target.provider, plan.target.model),
  });
  let forkResult;
  let targetThreadId;
  let verification;
  try {
    forkResult = await client.request("thread/fork", {
      threadId: plan.source.threadId,
      cwd: plan.target.cwd,
      modelProvider: plan.target.provider,
      model: plan.target.model,
      threadSource: plan.target.threadSource,
      excludeTurns: false,
      deferGoalContinuation: true,
    });
    targetThreadId = responseThread(forkResult)?.id || forkResult?.threadId || forkResult?.id || null;
    if (!targetThreadId) throw new Error("thread/fork 没有返回目标任务 ID");
    if (plan.target.name) {
      await client.request("thread/name/set", { threadId: targetThreadId, name: plan.target.name });
    }
    if (plan.target.isPinned) {
      await client.request("thread/metadata/update", { threadId: targetThreadId, isPinned: true });
    }
    verification = await verifyThread(client, targetThreadId);
  } finally {
    await client.close();
  }

  const targetDatabase = stateRow(targetThreadId);
  const checks = {
    newThreadId: targetThreadId !== plan.source.threadId,
    provider: targetDatabase?.model_provider === plan.target.provider,
    model: plan.target.model ? targetDatabase?.model === plan.target.model : true,
    threadSource: targetDatabase?.thread_source === USER_THREAD_SOURCE,
    cwd: verification.cwd === plan.source.cwd,
    turnCount: verification.turnCount === plan.source.turnCount,
    itemCount: verification.itemCount === plan.source.itemCount,
    visibleMessageCount: verification.visibleMessageCount === plan.source.visibleMessageCount,
    isPinned: plan.target.isPinned ? Boolean(targetDatabase?.is_pinned) : true,
  };
  if (!Object.values(checks).every(Boolean)) {
    throw new Error(`handoff 验收失败: ${JSON.stringify(checks)}`);
  }

  const normalization = plan.target.provider === "openai"
    ? await normalizeOpenAIReasoningContent(targetThreadId, backup.backupRoot)
    : null;
  if (normalization && normalization.normalizedCount !== plan.target.expectedReasoningNormalizations) {
    throw new Error(`推理字段清洗数量与 dry-run 不一致：预期 ${plan.target.expectedReasoningNormalizations}，实际 ${normalization.normalizedCount}`);
  }
  if (normalization && normalization.normalizedCount > 0 && !normalization.backupPath) {
    throw new Error("推理字段已被修改，但没有生成清洗前备份");
  }

  const entry = {
    sourceThreadId: plan.source.threadId,
    sourceProvider: plan.source.provider,
    sourceModel: plan.source.model,
    sourceRolloutPath: plan.source.rolloutPath,
    sourceRolloutSha256: plan.source.rolloutSha256,
    targetThreadId,
    targetProvider: plan.target.provider,
    targetModel: plan.target.model,
    targetName: plan.target.name,
    cwd: plan.target.cwd,
    handedOffAt: nowIso(),
    backupRoot: backup.backupRoot,
    checks,
    normalization: normalization
      ? {
          applied: true,
          normalizedReasoningCount: normalization.normalizedCount,
          targetRolloutSha256After: normalization.sha256After,
          backupPath: normalization.backupPath,
        }
      : { applied: false, normalizedReasoningCount: 0 },
  };
  if (options.recordManifest !== false) {
    const { manifestPath, manifest } = await readManifest(plan.testMode);
    await atomicWriteJson(manifestPath, {
      ...manifest,
      version: 1,
      updatedAt: nowIso(),
      currentThreadId: targetThreadId,
      currentProvider: plan.target.provider,
      handoffs: [...(manifest.handoffs || []), entry],
    });
  }
  return { type: "handed-off", plan, backup, entry, verification, targetDatabase };
}

export async function archiveTestThread(threadId, provider, model = null) {
  const client = await createAppServerClient({
    cwd: PROJECT_CWD,
    configOverrides: appServerProviderOverrides(provider, model),
  });
  try {
    const row = stateRow(threadId);
    if (row?.is_pinned) {
      await client.request("thread/metadata/update", { threadId, isPinned: false });
    }
    await client.request("thread/archive", { threadId });
  } finally {
    await client.close();
  }
  const after = stateRow(threadId);
  return {
    threadId,
    archived: Boolean(after?.archived),
    isPinnedAfterArchive: Boolean(after?.is_pinned),
    recoverableWith: "thread/unarchive",
  };
}

export async function rollingHandoff({ targetProvider, targetModel = null, execute = false }) {
  const { manifest } = await readManifest(false);
  const sourceThreadId = manifest.currentThreadId;
  const sourceProvider = manifest.currentProvider;
  if (!sourceThreadId || !sourceProvider) throw new Error("生产 handoff-manifest 缺少当前任务 ID 或提供商");
  const resolvedTargetModel = targetModel || manifest.currentModel || null;
  if (sourceProvider === targetProvider && (!resolvedTargetModel || manifest.currentModel === resolvedTargetModel)) {
    return {
      type: "rolling-handoff-noop",
      reason: `当前最新任务已经属于 ${targetProvider}`,
      currentThreadId: sourceThreadId,
      currentProvider: sourceProvider,
      currentModel: manifest.currentModel || null,
    };
  }
  const result = await handoffOne({
    execute,
    sourceThreadId,
    targetProvider,
    targetModel: resolvedTargetModel,
    targetName: manifest.taskName || "保持模型互通",
    testMode: false,
    pinTarget: manifest.pinTarget !== false,
  });
  if (!execute || result.type !== "handed-off") return result;

  const archivedSource = await archiveTestThread(sourceThreadId, sourceProvider, manifest.currentModel || null);
  if (!archivedSource.archived) throw new Error(`新任务已创建，但上一棒 ${sourceThreadId} 未能归档`);
  const refreshed = await readManifest(false);
  const handoffs = refreshed.manifest.handoffs || [];
  if (handoffs.length) handoffs[handoffs.length - 1] = { ...handoffs[handoffs.length - 1], sourceArchived: true };
  await atomicWriteJson(refreshed.manifestPath, {
    ...refreshed.manifest,
    currentThreadId: result.entry.targetThreadId,
    currentProvider: targetProvider,
    currentModel: resolvedTargetModel,
    handoffs,
    updatedAt: nowIso(),
  });
  return { ...result, archivedSource };
}
