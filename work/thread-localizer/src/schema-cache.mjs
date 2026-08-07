import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { CODEX_SCHEMA_CACHE_ROOT } from "./constants.mjs";
import { findCodexBinary } from "./appserver-client.mjs";
import { ensureDir, pathExists, sha256File } from "./utils.mjs";

const CLIENT_SCHEMA_NAME = "ClientRequest.json";
const METADATA_NAME = "schema-metadata.json";
const VERSION_PATTERN = /codex-cli\s+([^\s]+)/i;

function safeDirectorySegment(value) {
  const normalized = String(value || "unknown")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^\.+/, "");
  return normalized || "unknown";
}

function tail(text, limit = 4000) {
  return String(text || "").slice(-limit);
}

function runProcess(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", (error) => reject(error));
    child.once("close", (code, signal) => resolve({
      code: code ?? -1,
      signal,
      stdout: tail(stdout),
      stderr: tail(stderr),
    }));
  });
}

export async function readCodexVersion(codexBin) {
  const result = await runProcess(codexBin, ["--version"]);
  if (result.code !== 0) {
    throw new Error(`无法读取 Codex 版本（退出码 ${result.code}）。${tail(result.stderr || result.stdout)}`);
  }
  const match = `${result.stdout}\n${result.stderr}`.match(VERSION_PATTERN);
  if (!match) {
    throw new Error(`无法从 Codex --version 输出中识别版本。${tail(`${result.stdout}\n${result.stderr}`)}`);
  }
  return match[1];
}

export async function readCodexBinarySignature(codexBin) {
  const stat = await fs.stat(codexBin);
  return {
    path: path.resolve(codexBin),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

async function generateSchemaBundle(codexBin, outputRoot) {
  const result = await runProcess(codexBin, [
    "app-server",
    "generate-json-schema",
    "--experimental",
    "--out",
    outputRoot,
  ]);
  if (result.code !== 0) {
    throw new Error(
      `生成 app-server schema 失败（退出码 ${result.code}）。${tail(result.stderr || result.stdout)}`,
    );
  }
}

async function readMetadata(metadataPath) {
  try {
    return JSON.parse(await fs.readFile(metadataPath, "utf8"));
  } catch {
    return null;
  }
}

function sameSignature(left, right) {
  return Boolean(
    left
      && right
      && path.resolve(String(left.path)) === path.resolve(String(right.path))
      && Number(left.size) === Number(right.size)
      && Number(left.mtimeMs) === Number(right.mtimeMs),
  );
}

async function writeMetadata(metadataPath, metadata) {
  await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

export async function ensureSchemaRoot({
  explicitRoot = null,
  cacheRoot = CODEX_SCHEMA_CACHE_ROOT,
  codexBin = null,
  readVersion = readCodexVersion,
  readSignature = readCodexBinarySignature,
  generate = generateSchemaBundle,
} = {}) {
  if (explicitRoot) {
    return {
      schemaRoot: path.resolve(explicitRoot),
      source: "explicit",
      generated: false,
      codexVersion: null,
      metadataPath: null,
    };
  }

  const binary = codexBin || await findCodexBinary();
  const codexVersion = await readVersion(binary);
  const binarySignature = await readSignature(binary);
  const versionRoot = path.join(cacheRoot, safeDirectorySegment(codexVersion));
  const clientRequestPath = path.join(versionRoot, CLIENT_SCHEMA_NAME);
  const metadataPath = path.join(versionRoot, METADATA_NAME);
  const metadata = await readMetadata(metadataPath);

  if (
    metadata?.schemaVersion === 1
    && metadata.codexVersion === codexVersion
    && sameSignature(metadata.binarySignature, binarySignature)
    && await pathExists(clientRequestPath)
  ) {
    return {
      schemaRoot: versionRoot,
      source: "cache",
      generated: false,
      codexVersion,
      metadataPath,
      metadata,
    };
  }

  await ensureDir(versionRoot);
  // A failed refresh must not leave an old completion marker that could make
  // an incomplete or stale schema look current on the next run.
  await fs.rm(metadataPath, { force: true });
  await generate(binary, versionRoot);
  if (!(await pathExists(clientRequestPath))) {
    throw new Error(`Codex schema 生成命令成功返回，但缺少 ${clientRequestPath}`);
  }

  const clientRequestSha256 = await sha256File(clientRequestPath);
  const nextMetadata = {
    schemaVersion: 1,
    codexVersion,
    generatedAt: new Date().toISOString(),
    binarySignature,
    clientRequestSha256,
    includesExperimental: true,
  };
  await writeMetadata(metadataPath, nextMetadata);
  return {
    schemaRoot: versionRoot,
    source: "generated",
    generated: true,
    codexVersion,
    metadataPath,
    metadata: nextMetadata,
  };
}
