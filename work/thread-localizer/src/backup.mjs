import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync, backup as sqliteBackup } from "node:sqlite";
import { CODEX_HOME } from "./constants.mjs";
import { ensureDir, pathExists, timestampForPath } from "./utils.mjs";

export async function createTimestampedBackup({ sourceRolloutPath }) {
  const backupRoot = path.join(CODEX_HOME, "backups", `thread-localizer-${timestampForPath()}`);
  await ensureDir(backupRoot);
  const copied = [];

  const statePath = path.join(CODEX_HOME, "state_5.sqlite");
  if (await pathExists(statePath)) {
    const stateDestination = path.join(backupRoot, "state_5.sqlite");
    const sourceDb = new DatabaseSync(statePath, { readOnly: true });
    try {
      await sqliteBackup(sourceDb, stateDestination);
    } finally {
      sourceDb.close();
    }
    copied.push({ source: statePath, destination: stateDestination, kind: "sqlite-online-backup" });
  }

  const files = [
    { source: path.join(CODEX_HOME, "session_index.jsonl"), name: "session_index.jsonl" },
    { source: sourceRolloutPath, name: "source-rollout.jsonl" },
  ];
  for (const file of files) {
    if (!(await pathExists(file.source))) continue;
    const destination = path.join(backupRoot, file.name);
    await fs.copyFile(file.source, destination);
    copied.push({ source: file.source, destination, kind: "file-copy" });
  }
  return { backupRoot, copied, createdAt: new Date().toISOString() };
}
