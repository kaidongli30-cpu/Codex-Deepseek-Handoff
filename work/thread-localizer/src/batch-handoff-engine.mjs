import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createAppServerClient } from "./appserver-client.mjs";
import {
  BATCH_HANDOFF_MANIFEST_PATH,
  CODEX_HOME,
  HANDOFF_MANIFEST_PATH,
  PROJECT_CWD,
  REPORT_DIR,
} from "./constants.mjs";
import { archiveTestThread, handoffOne, rolloutState } from "./handoff-engine.mjs";
import {
  mapProjectCwd,
  normalizeCwd,
  readHandoffSettings,
  resolveTargetModel,
} from "./provider-config.mjs";
import { loadAndValidateSchema } from "./schema-guard.mjs";
import {
  atomicWriteJson,
  nowIso,
  pathExists,
  responseCursor,
  timestampForPath,
} from "./utils.mjs";

async function readJsonIfPresent(filePath, fallback) {
  if (!(await pathExists(filePath))) return fallback;
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function readBatchManifest() {
  const manifest = await readJsonIfPresent(BATCH_HANDOFF_MANIFEST_PATH, {
    version: 2,
    updatedAt: null,
    legacyImport: null,
    tasks: [],
    runs: [],
  });
  if (manifest.version !== 2 || !Array.isArray(manifest.tasks) || !Array.isArray(manifest.runs)) {
    throw new Error("batch-handoff-manifest.json 格式无效");
  }
  return manifest;
}

function compactName(value, threadId) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return `未命名任务 ${threadId.slice(-8)}`;
  return text.length > 100 ? `${text.slice(0, 97)}...` : text;
}

function excludedReason(settings, task) {
  const discovery = settings.discovery || {};
  if ((discovery.excludeThreadIds || []).includes(task.id)) return "thread-id-excluded";
  const matchedPrefix = (discovery.excludeNamePrefixes || []).find((prefix) => task.displayName.startsWith(prefix));
  return matchedPrefix ? `name-prefix-excluded:${matchedPrefix}` : null;
}

async function listAllInteractiveThreads() {
  const client = await createAppServerClient({ cwd: PROJECT_CWD });
  const threads = [];
  let cursor = null;
  const seen = new Set();
  try {
    for (;;) {
      const params = {
        archived: false,
        limit: 100,
        modelProviders: [],
        sortKey: "updated_at",
        sortDirection: "desc",
        useStateDbOnly: true,
      };
      if (cursor) params.cursor = cursor;
      const result = await client.request("thread/list", params);
      threads.push(...(Array.isArray(result?.data) ? result.data : []));
      const next = responseCursor(result);
      if (!next || seen.has(next)) break;
      seen.add(next);
      cursor = next;
    }
  } finally {
    await client.close();
  }
  return threads;
}

export async function discoverLocalTasks(settings = null) {
  const resolvedSettings = settings || await readHandoffSettings();
  const threads = await listAllInteractiveThreads();
  const db = new DatabaseSync(path.join(CODEX_HOME, "state_5.sqlite"), { readOnly: true });
  const statement = db.prepare(`SELECT id, name, title, model_provider, model, cwd, rollout_path,
    thread_source, archived, is_pinned FROM threads WHERE id = ?`);
  try {
    return threads.map((thread) => {
      const row = statement.get(thread.id) || {};
      const displayName = compactName(thread.name || row.name || row.title, thread.id);
      const task = {
        id: thread.id,
        displayName,
        explicitName: thread.name || row.name || null,
        provider: thread.modelProvider || row.model_provider || null,
        model: row.model || null,
        cwd: mapProjectCwd(resolvedSettings, thread.cwd || row.cwd),
        originalCwd: normalizeCwd(thread.cwd || row.cwd),
        rolloutPath: thread.path || row.rollout_path || null,
        isPinned: Boolean(thread.isPinned ?? row.is_pinned),
        threadSource: row.thread_source || thread.threadSource || null,
        source: thread.source || null,
        status: thread.status?.type || null,
        updatedAt: thread.updatedAt || null,
      };
      return {
        ...task,
        managed: Boolean(resolvedSettings.managedProviders?.[task.provider]),
        excludedReason: excludedReason(resolvedSettings, task),
      };
    });
  } finally {
    db.close();
  }
}

async function readLegacyManifest() {
  return await readJsonIfPresent(HANDOFF_MANIFEST_PATH, null);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeDiscoveredTasks(manifest, discovered, legacyManifest) {
  const next = clone(manifest);
  const tasks = Array.isArray(next.tasks) ? next.tasks : [];
  const legacyCurrentId = legacyManifest?.currentThreadId || null;
  const legacyRootId = legacyManifest?.handoffs?.[0]?.sourceThreadId || legacyCurrentId;
  let importedLegacy = next.legacyImport;

  for (const item of discovered) {
    if (!item.managed || item.excludedReason) continue;
    let task = tasks.find((candidate) => candidate.currentThreadId === item.id) || null;
    if (!task && item.id === legacyCurrentId) {
      task = tasks.find((candidate) => candidate.stableTaskId === legacyRootId) || null;
    }
    if (!task) {
      task = {
        stableTaskId: item.id === legacyCurrentId ? legacyRootId : item.id,
        displayName: item.displayName,
        explicitName: item.explicitName,
        canonicalCwd: item.cwd,
        isPinned: item.isPinned,
        currentThreadId: item.id,
        currentProvider: item.provider,
        currentModel: item.model,
        providerModels: item.model ? { [item.provider]: item.model } : {},
        enrolledAt: nowIso(),
        enrolledFrom: item.id === legacyCurrentId ? "legacy-single-task-manifest" : "auto-discovery",
        lastSeenAt: nowIso(),
        handoffs: [],
        lastError: null,
      };
      tasks.push(task);
    } else {
      task.displayName = item.displayName || task.displayName;
      task.explicitName = item.explicitName ?? task.explicitName ?? null;
      task.canonicalCwd = item.cwd || task.canonicalCwd;
      task.isPinned = item.isPinned;
      task.currentProvider = item.provider;
      task.currentModel = item.model;
      task.providerModels = { ...(task.providerModels || {}) };
      if (item.model) task.providerModels[item.provider] = item.model;
      task.lastSeenAt = nowIso();
      task.lastError = null;
    }
    if (item.id === legacyCurrentId && !importedLegacy) {
      importedLegacy = {
        importedAt: nowIso(),
        legacyManifestPath: HANDOFF_MANIFEST_PATH,
        legacyRootThreadId: legacyRootId,
        currentThreadId: legacyCurrentId,
      };
    }
  }

  next.tasks = tasks;
  next.legacyImport = importedLegacy;
  return next;
}

function findTask(manifest, stableTaskId) {
  return manifest.tasks.find((task) => task.stableTaskId === stableTaskId) || null;
}

export async function buildBatchHandoffPlan({ targetProvider, onlyTaskId = null } = {}) {
  const settings = await readHandoffSettings();
  if (!settings.managedProviders?.[targetProvider]) {
    throw new Error(`目标提供商未在 handoff-settings.json 中启用: ${targetProvider}`);
  }
  const schema = await loadAndValidateSchema();
  const [manifest, legacyManifest, discovered] = await Promise.all([
    readBatchManifest(),
    readLegacyManifest(),
    discoverLocalTasks(settings),
  ]);
  const nextManifest = mergeDiscoveredTasks(manifest, discovered, legacyManifest);
  const items = [];

  for (const discoveredTask of discovered) {
    if (!discoveredTask.managed) {
      items.push({
        stableTaskId: null,
        sourceThreadId: discoveredTask.id,
        displayName: discoveredTask.displayName,
        sourceProvider: discoveredTask.provider,
        sourceModel: discoveredTask.model,
        cwd: discoveredTask.cwd,
        action: "skip",
        reason: "unmanaged-provider",
      });
      continue;
    }
    if (discoveredTask.excludedReason) {
      items.push({
        stableTaskId: null,
        sourceThreadId: discoveredTask.id,
        displayName: discoveredTask.displayName,
        sourceProvider: discoveredTask.provider,
        sourceModel: discoveredTask.model,
        cwd: discoveredTask.cwd,
        action: "skip",
        reason: discoveredTask.excludedReason,
      });
      continue;
    }

    const task = nextManifest.tasks.find((candidate) => candidate.currentThreadId === discoveredTask.id);
    if (!task) throw new Error(`发现任务未能写入候选 manifest: ${discoveredTask.id}`);
    const selected = !onlyTaskId
      || task.stableTaskId === onlyTaskId
      || task.currentThreadId === onlyTaskId;
    const targetModel = resolveTargetModel(settings, targetProvider, task);
    const common = {
      stableTaskId: task.stableTaskId,
      sourceThreadId: task.currentThreadId,
      displayName: task.displayName,
      sourceProvider: task.currentProvider,
      sourceModel: task.currentModel,
      targetProvider,
      targetModel,
      cwd: task.canonicalCwd,
      isPinned: task.isPinned,
      pinning: {
        requested: task.isPinned,
        supported: Boolean(schema.threadMetadata?.pinning?.supported),
        action: task.isPinned && !schema.threadMetadata?.pinning?.supported
          ? "continue-unpinned-manual"
          : (task.isPinned ? "copy" : "not-requested"),
      },
    };
    if (!selected) {
      items.push({ ...common, action: "skip", reason: "not-selected" });
      continue;
    }
    if (task.currentProvider === targetProvider && task.currentModel === targetModel) {
      items.push({ ...common, action: "noop", reason: "already-on-target-provider-and-model" });
      continue;
    }
    try {
      const rollout = await rolloutState(task.currentThreadId);
      const safe = rollout.parseErrorCount === 0 && !rollout.activeTurn;
      items.push({
        ...common,
        action: safe ? "handoff" : "blocked",
        reason: safe ? null : (rollout.activeTurn ? "active-turn" : "rollout-parse-errors"),
        sourceRolloutPath: rollout.rolloutPath,
        sourceRolloutSha256: rollout.rolloutSha256,
        parseErrorCount: rollout.parseErrorCount,
        activeTurn: rollout.activeTurn,
        expectedReasoningNormalizations: targetProvider === "openai"
          ? rollout.reasoningContentArrayCount
          : 0,
        expectedWebSearchCallIdNormalizations: targetProvider === "openai"
          ? rollout.invalidWebSearchCallIdCount
          : 0,
        expectedWebSearchEventReferenceNormalizations: targetProvider === "openai"
          ? rollout.invalidWebSearchEventReferenceCount
          : 0,
      });
    } catch (error) {
      items.push({
        ...common,
        action: "blocked",
        reason: "rollout-inspection-failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const counts = items.reduce((result, item) => {
    result[item.action] = (result[item.action] || 0) + 1;
    return result;
  }, {});
  return {
    type: "batch-handoff-dry-run",
    generatedAt: nowIso(),
    targetProvider,
    targetModel: settings.managedProviders[targetProvider].activeModel,
    onlyTaskId,
    schema: {
      sha256: schema.schemaSha256,
      threadSourceField: schema.threadSourceField,
      threadMetadata: schema.threadMetadata,
    },
    settingsPath: path.resolve(PROJECT_CWD, "work", "thread-localizer", "data", "handoff-settings.json"),
    manifestPath: BATCH_HANDOFF_MANIFEST_PATH,
    discoveredCount: discovered.length,
    managedTaskCount: nextManifest.tasks.length,
    counts,
    items,
    nextManifest,
  };
}

function replaceTask(manifest, updatedTask) {
  manifest.tasks = manifest.tasks.map((task) => (
    task.stableTaskId === updatedTask.stableTaskId ? updatedTask : task
  ));
}

export async function batchHandoff({ targetProvider, onlyTaskId = null, execute = false } = {}) {
  const plan = await buildBatchHandoffPlan({ targetProvider, onlyTaskId });
  const dryRunPath = path.join(REPORT_DIR, `batch-handoff-dry-run-${timestampForPath()}.json`);
  await atomicWriteJson(dryRunPath, plan);
  if (!execute) return { ...plan, dryRunPath };

  const workingManifest = clone(plan.nextManifest);
  workingManifest.updatedAt = nowIso();
  await atomicWriteJson(BATCH_HANDOFF_MANIFEST_PATH, workingManifest);
  const results = [];

  for (const item of plan.items) {
    if (item.action === "skip") {
      results.push({ stableTaskId: item.stableTaskId, sourceThreadId: item.sourceThreadId, status: "skipped", reason: item.reason });
      continue;
    }
    if (item.action === "blocked") {
      const task = item.stableTaskId ? findTask(workingManifest, item.stableTaskId) : null;
      if (task) {
        task.lastError = { at: nowIso(), stage: "dry-run", reason: item.reason, message: item.error || null };
        replaceTask(workingManifest, task);
        workingManifest.updatedAt = nowIso();
        await atomicWriteJson(BATCH_HANDOFF_MANIFEST_PATH, workingManifest);
      }
      results.push({ stableTaskId: item.stableTaskId, sourceThreadId: item.sourceThreadId, status: "blocked", reason: item.reason, error: item.error || null });
      continue;
    }
    if (item.action === "noop") {
      const task = findTask(workingManifest, item.stableTaskId);
      if (task) {
        task.lastSeenAt = nowIso();
        task.lastError = null;
        replaceTask(workingManifest, task);
      }
      results.push({ stableTaskId: item.stableTaskId, sourceThreadId: item.sourceThreadId, status: "noop", reason: item.reason });
      continue;
    }

    const task = findTask(workingManifest, item.stableTaskId);
    if (!task) {
      results.push({ stableTaskId: item.stableTaskId, sourceThreadId: item.sourceThreadId, status: "failed", error: "manifest task missing" });
      continue;
    }
    try {
      const result = await handoffOne({
        execute: true,
        sourceThreadId: item.sourceThreadId,
        targetProvider: item.targetProvider,
        targetModel: item.targetModel,
        targetName: task.explicitName || task.displayName,
        pinTarget: item.isPinned,
        recordManifest: false,
        emitDryRun: false,
      });
      const archivedSource = await archiveTestThread(item.sourceThreadId, item.sourceProvider, item.sourceModel);
      if (!archivedSource.archived) {
        await archiveTestThread(result.entry.targetThreadId, item.targetProvider, item.targetModel);
        throw new Error(`目标已创建，但源任务 ${item.sourceThreadId} 未能归档；目标已回滚归档`);
      }
      task.currentThreadId = result.entry.targetThreadId;
      task.currentProvider = item.targetProvider;
      task.currentModel = item.targetModel;
      task.canonicalCwd = item.cwd;
      task.providerModels = { ...(task.providerModels || {}), [item.targetProvider]: item.targetModel };
      task.lastSeenAt = nowIso();
      task.lastError = null;
      task.handoffs = [
        ...(task.handoffs || []),
        { ...result.entry, sourceArchived: true },
      ];
      replaceTask(workingManifest, task);
      workingManifest.updatedAt = nowIso();
      await atomicWriteJson(BATCH_HANDOFF_MANIFEST_PATH, workingManifest);
      results.push({
        stableTaskId: task.stableTaskId,
        sourceThreadId: item.sourceThreadId,
        targetThreadId: result.entry.targetThreadId,
        status: "handed-off",
        sourceProvider: item.sourceProvider,
        targetProvider: item.targetProvider,
        targetModel: item.targetModel,
        cwd: item.cwd,
        checks: result.entry.checks,
        normalization: result.entry.normalization,
        pinning: result.entry.pinning,
        backupRoot: result.entry.backupRoot,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      task.lastError = { at: nowIso(), stage: "handoff", reason: "handoff-failed", message };
      replaceTask(workingManifest, task);
      workingManifest.updatedAt = nowIso();
      await atomicWriteJson(BATCH_HANDOFF_MANIFEST_PATH, workingManifest);
      results.push({ stableTaskId: task.stableTaskId, sourceThreadId: item.sourceThreadId, status: "failed", error: message });
    }
  }

  const summary = {
    handedOff: results.filter((item) => item.status === "handed-off").length,
    noop: results.filter((item) => item.status === "noop").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    blocked: results.filter((item) => item.status === "blocked").length,
    failed: results.filter((item) => item.status === "failed").length,
  };
  const run = {
    runAt: nowIso(),
    targetProvider,
    onlyTaskId,
    dryRunPath,
    summary,
  };
  workingManifest.runs = [...(workingManifest.runs || []), run].slice(-100);
  workingManifest.updatedAt = nowIso();
  await atomicWriteJson(BATCH_HANDOFF_MANIFEST_PATH, workingManifest);
  const resultPath = path.join(REPORT_DIR, `batch-handoff-result-${timestampForPath()}.json`);
  const output = {
    type: summary.failed || summary.blocked ? "batch-handoff-complete-with-errors" : "batch-handoff-complete",
    targetProvider,
    onlyTaskId,
    dryRunPath,
    resultPath,
    summary,
    results,
    manifestPath: BATCH_HANDOFF_MANIFEST_PATH,
  };
  await atomicWriteJson(resultPath, output);
  return output;
}
