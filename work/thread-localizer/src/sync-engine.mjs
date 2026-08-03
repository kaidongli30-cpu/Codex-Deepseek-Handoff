import crypto from "node:crypto";
import { atomicWriteJson, nowIso, pathExists, readJsonl, sha256File } from "./utils.mjs";
import { createTimestampedBackup } from "./backup.mjs";
import { createAppServerClient } from "./appserver-client.mjs";
import { DEEPSEEK_MODEL, DEEPSEEK_PROVIDER, PROJECT_CWD, SYNC_MANIFEST_PATH } from "./constants.mjs";
import { findRolloutPath } from "./rollout-reader.mjs";
import { verifyThread } from "./verify-mirror.mjs";

const INJECTABLE_ITEM_TYPES = new Set([
  "message",
  "reasoning",
  "function_call",
  "function_call_output",
  "custom_tool_call",
  "custom_tool_call_output",
]);

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sanitizedVisibleMessage(payload) {
  if (!payload || payload.type !== "message" || !["user", "assistant"].includes(payload.role)) return null;
  const item = {
    type: "message",
    role: payload.role,
    content: Array.isArray(payload.content) ? payload.content : [],
  };
  if (payload.status) item.status = payload.status;
  if (payload.phase) item.phase = payload.phase;
  return item;
}

function injectablePayload(payload) {
  if (!payload || !INJECTABLE_ITEM_TYPES.has(payload.type)) return null;
  if (payload.type === "message" && !["user", "assistant"].includes(payload.role)) return null;
  return payload;
}

function commonPrefixLength(left, right) {
  let index = 0;
  while (index < left.length && index < right.length && left[index].hash === right[index].hash) index += 1;
  return index;
}

async function inspectRollout(threadId) {
  const rolloutPath = await findRolloutPath(threadId);
  if (!rolloutPath) throw new Error(`找不到任务 ${threadId} 的 rollout`);
  const parsed = await readJsonl(rolloutPath);
  let activeTurnStartLine = null;
  for (const record of parsed.records) {
    const value = record.value;
    if (value?.type !== "event_msg") continue;
    if (value.payload?.type === "task_started") activeTurnStartLine = record.line;
    if (["task_complete", "turn_aborted"].includes(value.payload?.type)) activeTurnStartLine = null;
  }
  const safeLastLine = activeTurnStartLine === null ? Number.POSITIVE_INFINITY : activeTurnStartLine - 1;
  const responseItems = parsed.records
    .filter((record) => record.line <= safeLastLine && record.value?.type === "response_item")
    .map((record) => ({ line: record.line, payload: record.value.payload }));
  const visible = [];
  for (const record of responseItems) {
    const sanitized = sanitizedVisibleMessage(record.payload);
    if (sanitized) visible.push({ line: record.line, hash: stableHash(sanitized) });
  }
  return {
    threadId,
    rolloutPath,
    rolloutSha256: await sha256File(rolloutPath),
    parseErrors: parsed.errors,
    activeTurnExcluded: activeTurnStartLine !== null,
    activeTurnStartLine,
    safeLastLine,
    responseItems,
    visible,
  };
}

function publicInspection(inspection) {
  return {
    threadId: inspection.threadId,
    rolloutPath: inspection.rolloutPath,
    rolloutSha256: inspection.rolloutSha256,
    parseErrorCount: inspection.parseErrors.length,
    completedVisibleMessageCount: inspection.visible.length,
    activeTurnExcluded: inspection.activeTurnExcluded,
    activeTurnStartLine: inspection.activeTurnStartLine,
  };
}

export async function buildSyncPlan({ sourceThreadId, targetThreadId, targetProvider, targetModel = null }) {
  if (!sourceThreadId || !targetThreadId) throw new Error("同步需要 sourceThreadId 和 targetThreadId");
  if (sourceThreadId === targetThreadId) throw new Error("源任务和目标任务不能是同一个 ID");
  const source = await inspectRollout(sourceThreadId);
  const target = await inspectRollout(targetThreadId);
  const prefixLength = commonPrefixLength(source.visible, target.visible);
  const targetIsPrefix = prefixLength === target.visible.length;
  const sourceIsPrefix = prefixLength === source.visible.length;
  let action = "blocked-diverged";
  let items = [];
  let unknownDeltaItemTypes = [];
  if (targetIsPrefix && source.visible.length > target.visible.length) {
    action = "append-source-delta";
    const firstNewVisibleLine = source.visible[target.visible.length].line;
    const deltaResponseItems = source.responseItems.filter((record) => record.line >= firstNewVisibleLine);
    const unknown = new Set();
    for (const record of deltaResponseItems) {
      const payload = injectablePayload(record.payload);
      if (payload) items.push(payload);
      else if (record.payload?.type !== "message") unknown.add(record.payload?.type || "unknown");
    }
    unknownDeltaItemTypes = [...unknown].sort();
  } else if (sourceIsPrefix) {
    action = source.visible.length === target.visible.length ? "already-synchronized" : "target-ahead";
  }
  const plan = {
    generatedAt: nowIso(),
    source: publicInspection(source),
    target: { ...publicInspection(target), provider: targetProvider, model: targetModel },
    comparison: {
      commonVisiblePrefixCount: prefixLength,
      sourceCompletedVisibleMessageCount: source.visible.length,
      targetCompletedVisibleMessageCount: target.visible.length,
      deltaVisibleMessageCount: targetIsPrefix ? source.visible.length - target.visible.length : null,
      injectableItemCount: items.length,
      unknownDeltaItemTypes,
      action,
    },
    safeToProceed: source.parseErrors.length === 0
      && target.parseErrors.length === 0
      && unknownDeltaItemTypes.length === 0
      && action !== "blocked-diverged",
  };
  return { plan, items };
}

function providerConfig(targetProvider, targetModel) {
  if (targetProvider !== DEEPSEEK_PROVIDER) return {};
  return {
    model_provider: DEEPSEEK_PROVIDER,
    model: targetModel || DEEPSEEK_MODEL,
    forced_login_method: "api",
  };
}

async function readSyncManifest() {
  if (!(await pathExists(SYNC_MANIFEST_PATH))) return { version: 1, syncs: [] };
  return JSON.parse(await (await import("node:fs/promises")).readFile(SYNC_MANIFEST_PATH, "utf8"));
}

export async function syncOne({ sourceThreadId, targetThreadId, targetProvider, targetModel = null, execute = false }) {
  const { plan, items } = await buildSyncPlan({ sourceThreadId, targetThreadId, targetProvider, targetModel });
  console.log(JSON.stringify({ type: "sync-dry-run", plan }, null, 2));
  if (!execute) return { type: "sync-dry-run", plan };
  if (!plan.safeToProceed) throw new Error("同步 dry-run 未通过：历史已经分叉、rollout 有解析错误，或出现未确认的项目类型");
  if (plan.comparison.action !== "append-source-delta") return { type: "sync-noop", plan };

  const backup = await createTimestampedBackup({ sourceRolloutPath: plan.target.rolloutPath });
  const client = await createAppServerClient({
    cwd: PROJECT_CWD,
    configOverrides: providerConfig(targetProvider, targetModel),
  });
  let verification;
  try {
    const resumeParams = { threadId: targetThreadId };
    if (targetProvider) resumeParams.modelProvider = targetProvider;
    if (targetModel) resumeParams.model = targetModel;
    await client.request("thread/resume", resumeParams);
    await client.request("thread/inject_items", { threadId: targetThreadId, items });
    verification = await verifyThread(client, targetThreadId);
  } finally {
    await client.close();
  }

  const after = await buildSyncPlan({ sourceThreadId, targetThreadId, targetProvider, targetModel });
  const converged = after.plan.comparison.action === "already-synchronized"
    && after.plan.comparison.commonVisiblePrefixCount === plan.source.completedVisibleMessageCount;
  if (!converged) throw new Error("同步写入后未收敛到相同的已完成消息序列，已停止后续操作");

  const manifest = await readSyncManifest();
  const entry = {
    sourceThreadId,
    targetThreadId,
    targetProvider,
    targetModel,
    syncedAt: nowIso(),
    injectedItemCount: items.length,
    injectedVisibleMessageCount: plan.comparison.deltaVisibleMessageCount,
    sourceRolloutSha256Before: plan.source.rolloutSha256,
    targetRolloutSha256Before: plan.target.rolloutSha256,
    targetRolloutSha256After: after.plan.target.rolloutSha256,
    backupRoot: backup.backupRoot,
  };
  await atomicWriteJson(SYNC_MANIFEST_PATH, {
    version: 1,
    updatedAt: nowIso(),
    syncs: [...(manifest.syncs || []), entry],
  });
  return { type: "synchronized", plan, backup, entry, verification, after: after.plan };
}
