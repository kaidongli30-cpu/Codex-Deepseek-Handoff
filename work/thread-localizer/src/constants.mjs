import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PROJECT_ROOT = path.resolve(TOOL_ROOT, "..", "..");

export const SOURCE_THREAD_ID = "019fbc69-f797-7603-b05f-7e888752d7a4";
export const SOURCE_THREAD_NAME = "保持模型互通";
export const MIRROR_THREAD_NAME = "[本地镜像] 保持模型互通";
export const DEEPSEEK_MIRROR_THREAD_NAME = "[DeepSeek镜像] 保持模型互通";
export const DEFAULT_PROVIDER = "openai";
export const DEEPSEEK_PROVIDER = "deepseek";
export const DEEPSEEK_MODEL = "deepseek-v4-flash";
export const USER_THREAD_SOURCE = "user";

export const CODEX_HOME = path.resolve(
  process.env.CODEX_HOME || path.join(process.env.USERPROFILE || os.homedir(), ".codex"),
);
export const CODEX_SCHEMA_ROOT = path.resolve(
  process.env.CODEX_SCHEMA_ROOT || "C:\\tmp\\codex-appserver-schema-20260802",
);
export const PROJECT_CWD = path.resolve(process.env.THREAD_LOCALIZER_CWD || PROJECT_ROOT);
export const SESSION_INDEX_PATH = path.join(CODEX_HOME, "session_index.jsonl");
export const MANIFEST_PATH = path.join(TOOL_ROOT, "data", "migration-manifest.json");
export const SYNC_MANIFEST_PATH = path.join(TOOL_ROOT, "data", "sync-manifest.json");
export const HANDOFF_MANIFEST_PATH = path.join(TOOL_ROOT, "data", "handoff-manifest.json");
export const HANDOFF_TEST_MANIFEST_PATH = path.join(TOOL_ROOT, "data", "handoff-test-manifest.json");
export const BATCH_HANDOFF_MANIFEST_PATH = path.join(TOOL_ROOT, "data", "batch-handoff-manifest.json");
export const HANDOFF_SETTINGS_PATH = path.join(TOOL_ROOT, "data", "handoff-settings.json");
export const REPORT_DIR = path.join(TOOL_ROOT, "reports");

export const REQUIRED_METHODS = [
  "initialize",
  "thread/list",
  "thread/read",
  "thread/items/list",
  "thread/fork",
  "thread/start",
  "thread/inject_items",
  "thread/name/set",
];

export const DEFAULT_CLIENT_INFO = {
  name: "codex-thread-localizer",
  title: "Codex Thread Localizer",
  version: "0.1.0",
};
