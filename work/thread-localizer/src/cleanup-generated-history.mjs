import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createAppServerClient } from "./appserver-client.mjs";
import { BATCH_HANDOFF_MANIFEST_PATH, CODEX_HOME, PROJECT_CWD } from "./constants.mjs";
import { atomicWriteJson, nowIso, pathExists, timestampForPath } from "./utils.mjs";

export function assertChildPath(parent, candidate) {
  const resolvedParent = path.resolve(parent);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedParent, resolvedCandidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`拒绝处理不在指定目录内的路径: ${resolvedCandidate}`);
  }
  return resolvedCandidate;
}

async function directoryBytes(directory) {
  let total = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(child);
    else if (entry.isFile()) total += (await fs.stat(child)).size;
  }
  return total;
}

export function manifestPredecessors(manifest) {
  const current = new Set((manifest.tasks || []).map((task) => task.currentThreadId).filter(Boolean));
  return new Set((manifest.tasks || []).flatMap((task) => (
    (task.handoffs || [])
      .filter((handoff) => handoff.sourceArchived || handoff.sourceDeleted === false)
      .map((handoff) => handoff.sourceThreadId)
      .filter((threadId) => threadId && !current.has(threadId))
  )));
}

export async function buildCleanupPlan() {
  const manifest = JSON.parse(await fs.readFile(BATCH_HANDOFF_MANIFEST_PATH, "utf8"));
  const predecessorIds = manifestPredecessors(manifest);
  const db = new DatabaseSync(path.join(CODEX_HOME, "state_5.sqlite"), { readOnly: true });
  const statement = db.prepare("SELECT id, archived, rollout_path FROM threads WHERE id = ?");
  const archivedThreads = [];
  const skippedThreads = [];
  try {
    for (const threadId of predecessorIds) {
      const row = statement.get(threadId);
      if (!row) skippedThreads.push({ threadId, reason: "already-absent" });
      else if (!row.archived) skippedThreads.push({ threadId, reason: "not-archived" });
      else archivedThreads.push({ threadId, rolloutPath: row.rollout_path || null });
    }
  } finally {
    db.close();
  }

  const backupsRoot = path.join(CODEX_HOME, "backups");
  const backupDirectories = [];
  if (await pathExists(backupsRoot)) {
    for (const entry of await fs.readdir(backupsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("thread-localizer-")) continue;
      const fullPath = assertChildPath(backupsRoot, path.join(backupsRoot, entry.name));
      backupDirectories.push({ path: fullPath, bytes: await directoryBytes(fullPath) });
    }
  }

  return {
    type: "handoff-generated-history-cleanup-plan",
    generatedAt: nowIso(),
    manifestPath: BATCH_HANDOFF_MANIFEST_PATH,
    backupsRoot,
    archivedThreads,
    skippedThreads,
    backupDirectories,
    summary: {
      archivedThreadCount: archivedThreads.length,
      skippedThreadCount: skippedThreads.length,
      backupDirectoryCount: backupDirectories.length,
      backupBytes: backupDirectories.reduce((sum, entry) => sum + entry.bytes, 0),
    },
  };
}

export async function cleanupGeneratedHistory({ execute = false, reportDir }) {
  if (!reportDir) throw new Error("清理必须明确指定 --report-dir");
  const plan = await buildCleanupPlan();
  await fs.mkdir(reportDir, { recursive: true });
  const dryRunPath = path.join(reportDir, `cleanup-dry-run-${timestampForPath()}.json`);
  await atomicWriteJson(dryRunPath, plan);
  if (!execute) return { ...plan, dryRunPath };

  const deletedThreads = [];
  const failedThreads = [];
  const client = await createAppServerClient({ cwd: PROJECT_CWD });
  try {
    for (const item of plan.archivedThreads) {
      try {
        await client.request("thread/delete", { threadId: item.threadId });
        deletedThreads.push(item.threadId);
      } catch (error) {
        failedThreads.push({ threadId: item.threadId, error: error instanceof Error ? error.message : String(error) });
      }
    }
  } finally {
    await client.close();
  }

  const deletedBackups = [];
  const failedBackups = [];
  for (const item of plan.backupDirectories) {
    try {
      const verified = assertChildPath(plan.backupsRoot, item.path);
      await fs.rm(verified, { recursive: true, force: false });
      deletedBackups.push(verified);
    } catch (error) {
      failedBackups.push({ path: item.path, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const manifest = JSON.parse(await fs.readFile(BATCH_HANDOFF_MANIFEST_PATH, "utf8"));
  const deletedSet = new Set(deletedThreads);
  for (const task of manifest.tasks || []) {
    task.handoffs = (task.handoffs || []).map((handoff) => (
      deletedSet.has(handoff.sourceThreadId)
        ? { ...handoff, sourceDeleted: true, sourceDeletedAt: nowIso() }
        : handoff
    ));
  }
  manifest.cleanup = {
    lastRunAt: nowIso(),
    deletedThreadCount: deletedThreads.length,
    deletedBackupDirectoryCount: deletedBackups.length,
    failedThreadCount: failedThreads.length,
    failedBackupCount: failedBackups.length,
  };
  manifest.updatedAt = nowIso();
  await atomicWriteJson(BATCH_HANDOFF_MANIFEST_PATH, manifest);

  const result = {
    type: failedThreads.length || failedBackups.length
      ? "handoff-generated-history-cleanup-complete-with-errors"
      : "handoff-generated-history-cleanup-complete",
    completedAt: nowIso(),
    dryRunPath,
    deletedThreads,
    failedThreads,
    deletedBackups,
    failedBackups,
  };
  const resultPath = path.join(reportDir, `cleanup-result-${timestampForPath()}.json`);
  await atomicWriteJson(resultPath, { ...result, resultPath });
  return { ...result, resultPath };
}
