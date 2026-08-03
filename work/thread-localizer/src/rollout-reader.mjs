import fs from "node:fs/promises";
import path from "node:path";
import { CODEX_HOME, SESSION_INDEX_PATH } from "./constants.mjs";
import { readJsonl, countVisibleMessages, pathExists } from "./utils.mjs";

async function walkJsonl(root) {
  const found = [];
  async function visit(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) found.push(fullPath);
    }
  }
  await visit(root);
  return found;
}

async function rolloutFromSessionIndex(threadId) {
  if (!(await pathExists(SESSION_INDEX_PATH))) return null;
  const { records } = await readJsonl(SESSION_INDEX_PATH);
  const match = records.map((record) => record.value).find((value) => value?.id === threadId);
  if (match?.rollout_path && await pathExists(match.rollout_path)) return match.rollout_path;
  return null;
}

export async function findRolloutPath(threadId) {
  if (!threadId) throw new Error("查找 rollout 时必须提供任务 ID");
  const indexed = await rolloutFromSessionIndex(threadId);
  if (indexed) return indexed;
  const roots = [path.join(CODEX_HOME, "sessions"), path.join(CODEX_HOME, "archived_sessions")];
  for (const root of roots) {
    const files = await walkJsonl(root);
    const matches = files.filter((filePath) => path.basename(filePath).includes(threadId));
    if (matches.length) {
      matches.sort();
      return matches[0];
    }
  }
  return null;
}

function sanitizeMessagePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.type !== "message" || !["user", "assistant"].includes(payload.role)) return null;
  const item = {
    type: "message",
    role: payload.role,
    content: Array.isArray(payload.content) ? payload.content : [],
  };
  if (payload.status) item.status = payload.status;
  if (payload.phase) item.phase = payload.phase;
  return item;
}

export async function readRolloutMessages(rolloutPath) {
  if (!rolloutPath) throw new Error("找不到源任务 rollout 路径");
  const parsed = await readJsonl(rolloutPath);
  const items = [];
  for (const record of parsed.records) {
    const value = record.value;
    if (value?.type !== "response_item") continue;
    const item = sanitizeMessagePayload(value.payload);
    if (item) items.push(item);
  }
  return {
    rolloutPath,
    parseErrors: parsed.errors,
    items,
    visibleMessageCount: countVisibleMessages(items),
  };
}
