import path from "node:path";
import {
  CODEX_HOME,
  DEFAULT_PROVIDER,
  DEEPSEEK_MODEL,
  DEEPSEEK_MIRROR_THREAD_NAME,
  MANIFEST_PATH,
  MIRROR_THREAD_NAME,
  PROJECT_CWD,
  SOURCE_THREAD_ID,
  SOURCE_THREAD_NAME,
  USER_THREAD_SOURCE,
} from "./constants.mjs";
import { findRolloutPath, readRolloutMessages } from "./rollout-reader.mjs";
import { loadAndValidateSchema } from "./schema-guard.mjs";
import { pathExists, readJsonl, sha256File } from "./utils.mjs";

async function loadManifest() {
  if (!(await pathExists(MANIFEST_PATH))) return null;
  try {
    return JSON.parse(await (await import("node:fs/promises")).readFile(MANIFEST_PATH, "utf8"));
  } catch (error) {
    throw new Error(`migration-manifest.json 无法读取或不是有效 JSON: ${error.message}`);
  }
}

function sourceIndexEntry(records, threadId) {
  return records.map((record) => record.value).find((value) => value?.id === threadId) || null;
}

export function manifestProvider(entry) {
  return entry?.targetProvider || DEFAULT_PROVIDER;
}

export async function readManifest() {
  if (!(await pathExists(MANIFEST_PATH))) return { version: 1, migrations: [] };
  try {
    return JSON.parse(await (await import("node:fs/promises")).readFile(MANIFEST_PATH, "utf8"));
  } catch (error) {
    throw new Error(`migration-manifest.json 无法读取或不是有效 JSON: ${error.message}`);
  }
}

export function defaultMirrorName(provider) {
  return provider === "deepseek" ? DEEPSEEK_MIRROR_THREAD_NAME : MIRROR_THREAD_NAME;
}

export async function buildMigrationPlan({
  sourceThreadId = SOURCE_THREAD_ID,
  forkThreadId = sourceThreadId,
  sourceName = SOURCE_THREAD_NAME,
  targetProvider = DEFAULT_PROVIDER,
  targetModel = null,
  mirrorName = defaultMirrorName(targetProvider),
  cwd = PROJECT_CWD,
  repairVisibility = false,
} = {}) {
  const schema = await loadAndValidateSchema();
  const rolloutPath = await findRolloutPath(forkThreadId);
  if (!rolloutPath) throw new Error(`找不到任务 ${sourceThreadId} 的 rollout`);
  const rollout = await readRolloutMessages(rolloutPath);
  const rolloutSha256 = await sha256File(rolloutPath);
  const indexRecords = (await pathExists(path.join(CODEX_HOME, "session_index.jsonl")))
    ? (await readJsonl(path.join(CODEX_HOME, "session_index.jsonl"))).records
    : [];
  const indexEntry = sourceIndexEntry(indexRecords, sourceThreadId);
  const manifest = await readManifest();
  const existing = manifest?.migrations?.find((entry) => (
    entry.sourceThreadId === sourceThreadId && manifestProvider(entry) === targetProvider
  )) || null;

  return {
    generatedAt: new Date().toISOString(),
    source: {
      threadId: sourceThreadId,
      forkThreadId,
      expectedName: sourceName,
      cwd,
      rolloutPath: path.resolve(rolloutPath),
      rolloutSha256,
      visibleMessageCount: rollout.visibleMessageCount,
      extractedItemCount: rollout.items.length,
      parseErrorCount: rollout.parseErrors.length,
      sessionIndexPresent: Boolean(indexEntry),
    },
    target: {
      mirrorName,
      modelProvider: targetProvider,
      model: targetModel,
      cwd,
      threadSource: USER_THREAD_SOURCE,
      requestedOrder: [
        "thread/fork by threadId",
        "thread/fork by rollout path",
        "thread/start + thread/inject_items",
      ],
    },
    schema: {
      root: schema.schemaRoot,
      clientRequestPath: schema.clientRequestPath,
      sha256: schema.schemaSha256,
      injectMethod: schema.injectMethod,
      threadSourceField: schema.threadSourceField,
    },
    existingManifestEntry: existing
      ? {
          mirrorThreadId: existing.mirrorThreadId,
          targetProvider: manifestProvider(existing),
          targetModel: existing.targetModel || null,
          method: existing.method,
          migratedAt: existing.migratedAt,
          sourceRolloutSha256: existing.sourceRolloutSha256,
          threadSource: existing.threadSource || null,
        }
      : null,
    visibilityRepair: repairVisibility
      ? {
          enabled: true,
          previousMirrorThreadId: existing?.mirrorThreadId || null,
          reason: existing?.threadSource === USER_THREAD_SOURCE
            ? "existing mirror already has threadSource=user"
            : "existing mirror was created without threadSource=user",
        }
      : { enabled: false },
    safeToProceed: rollout.parseErrors.length === 0 && (repairVisibility
      ? Boolean(existing) && existing.threadSource !== USER_THREAD_SOURCE
      : !existing),
  };
}
