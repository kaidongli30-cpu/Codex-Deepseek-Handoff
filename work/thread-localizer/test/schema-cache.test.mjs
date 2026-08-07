import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ensureSchemaRoot } from "../src/schema-cache.mjs";

const testRoot = process.env.THREAD_LOCALIZER_TEST_ROOT
  || path.join(process.env.TEMP || process.env.TMP || ".", "codex-thread-localizer-schema-cache-tests");

async function makeRoot(name) {
  const root = path.join(testRoot, `${name}-${process.pid}-${crypto.randomUUID()}`);
  await fs.mkdir(root, { recursive: true });
  return root;
}

function fakeSignature(pathName, size = 1, mtimeMs = 1) {
  return { path: pathName, size, mtimeMs };
}

test("explicit CODEX_SCHEMA_ROOT is used without generating a cache", async () => {
  const explicitRoot = await makeRoot("explicit");
  let generated = false;
  const result = await ensureSchemaRoot({
    explicitRoot,
    generate: async () => { generated = true; },
  });

  assert.equal(result.schemaRoot, path.resolve(explicitRoot));
  assert.equal(result.source, "explicit");
  assert.equal(result.generated, false);
  assert.equal(generated, false);
});

test("missing version cache is generated and receives metadata", async () => {
  const cacheRoot = await makeRoot("generate");
  const binary = path.join(cacheRoot, "codex.exe");
  const signature = fakeSignature(binary, 123, 456);
  let generateCount = 0;
  const result = await ensureSchemaRoot({
    cacheRoot,
    codexBin: binary,
    readVersion: async () => "0.147.0-alpha.1.2",
    readSignature: async () => signature,
    generate: async (_binary, outputRoot) => {
      generateCount += 1;
      await fs.writeFile(path.join(outputRoot, "ClientRequest.json"), "{}\n", "utf8");
    },
  });

  assert.equal(generateCount, 1);
  assert.equal(result.source, "generated");
  assert.equal(result.generated, true);
  const metadata = JSON.parse(await fs.readFile(result.metadataPath, "utf8"));
  assert.equal(metadata.codexVersion, "0.147.0-alpha.1.2");
  assert.deepEqual(metadata.binarySignature, signature);
  assert.equal(metadata.includesExperimental, true);
  assert.equal(metadata.clientRequestSha256, await (async () => {
    const hash = crypto.createHash("sha256");
    hash.update(await fs.readFile(path.join(result.schemaRoot, "ClientRequest.json")));
    return hash.digest("hex");
  })());
});

test("matching version cache is reused without regeneration", async () => {
  const cacheRoot = await makeRoot("reuse");
  const binary = path.join(cacheRoot, "codex.exe");
  const signature = fakeSignature(binary, 123, 456);
  let generateCount = 0;
  const options = {
    cacheRoot,
    codexBin: binary,
    readVersion: async () => "0.147.0-alpha.1.2",
    readSignature: async () => signature,
    generate: async (_binary, outputRoot) => {
      generateCount += 1;
      await fs.writeFile(path.join(outputRoot, "ClientRequest.json"), "{}\n", "utf8");
    },
  };

  const first = await ensureSchemaRoot(options);
  const second = await ensureSchemaRoot(options);
  assert.equal(first.schemaRoot, second.schemaRoot);
  assert.equal(second.source, "cache");
  assert.equal(second.generated, false);
  assert.equal(generateCount, 1);
});

test("changed binary signature regenerates the same version cache", async () => {
  const cacheRoot = await makeRoot("refresh");
  const binary = path.join(cacheRoot, "codex.exe");
  let signature = fakeSignature(binary, 123, 456);
  let generateCount = 0;
  const options = {
    cacheRoot,
    codexBin: binary,
    readVersion: async () => "0.147.0-alpha.1.2",
    readSignature: async () => signature,
    generate: async (_binary, outputRoot) => {
      generateCount += 1;
      await fs.writeFile(path.join(outputRoot, "ClientRequest.json"), `${generateCount}\n`, "utf8");
    },
  };

  await ensureSchemaRoot(options);
  signature = fakeSignature(binary, 456, 789);
  const refreshed = await ensureSchemaRoot(options);
  assert.equal(refreshed.source, "generated");
  assert.equal(refreshed.generated, true);
  assert.equal(generateCount, 2);
  assert.equal(await fs.readFile(path.join(refreshed.schemaRoot, "ClientRequest.json"), "utf8"), "2\n");
});
