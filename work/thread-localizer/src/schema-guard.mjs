import fs from "node:fs/promises";
import path from "node:path";
import { CODEX_SCHEMA_ROOT, REQUIRED_METHODS } from "./constants.mjs";
import { ensureSchemaRoot } from "./schema-cache.mjs";
import { sha256File } from "./utils.mjs";

export class SchemaMismatchError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SchemaMismatchError";
    this.details = details;
  }
}

function schemaMethodNames(schema) {
  const methods = [];
  for (const branch of schema.oneOf || []) {
    const values = branch?.properties?.method?.enum;
    if (Array.isArray(values)) methods.push(...values);
  }
  return [...new Set(methods)];
}

function requiredDefinitionFields(schema, definitionName) {
  return schema.definitions?.[definitionName]?.required || [];
}

function definitionProperties(schema, definitionName) {
  return schema.definitions?.[definitionName]?.properties || {};
}

export function threadMetadataCapabilities(schema) {
  const methods = schemaMethodNames(schema);
  const fields = Object.keys(definitionProperties(schema, "ThreadMetadataUpdateParams"));
  const supportsMetadataUpdate = methods.includes("thread/metadata/update");
  const supportsPinning = supportsMetadataUpdate && fields.includes("isPinned");
  return {
    updateFields: fields,
    pinning: {
      supported: supportsPinning,
      method: supportsPinning ? "thread/metadata/update" : null,
      field: supportsPinning ? "isPinned" : null,
    },
  };
}

export async function loadAndValidateSchema(schemaRoot = CODEX_SCHEMA_ROOT) {
  const resolved = await ensureSchemaRoot({ explicitRoot: schemaRoot });
  const clientRequestPath = path.join(resolved.schemaRoot, "ClientRequest.json");
  let schema;
  try {
    schema = JSON.parse(await fs.readFile(clientRequestPath, "utf8"));
  } catch (error) {
    throw new SchemaMismatchError(`无法读取 app-server schema: ${clientRequestPath}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  const methods = schemaMethodNames(schema);
  const missingMethods = REQUIRED_METHODS.filter((method) => !methods.includes(method));
  if (missingMethods.length) {
    throw new SchemaMismatchError("当前 app-server schema 缺少实施所需的方法", {
      missingMethods,
      availableRelevantMethods: methods.filter((method) => method.startsWith("thread/") || method === "initialize"),
    });
  }
  if (methods.includes("thread/injectItems")) {
    throw new SchemaMismatchError("schema 同时出现未确认的 thread/injectItems 方法", {
      conflictingMethod: "thread/injectItems",
    });
  }

  const injectRequired = requiredDefinitionFields(schema, "ThreadInjectItemsParams");
  const forkRequired = requiredDefinitionFields(schema, "ThreadForkParams");
  const forkProperties = definitionProperties(schema, "ThreadForkParams");
  const startProperties = definitionProperties(schema, "ThreadStartParams");
  const threadMetadata = threadMetadataCapabilities(schema);
  if (!injectRequired.includes("threadId") || !injectRequired.includes("items")) {
    throw new SchemaMismatchError("ThreadInjectItemsParams 字段与当前实施方案不一致", { injectRequired });
  }
  if (!forkRequired.includes("threadId")) {
    throw new SchemaMismatchError("ThreadForkParams 缺少 threadId", { forkRequired });
  }
  if (!forkProperties.threadSource || !startProperties.threadSource) {
    throw new SchemaMismatchError("app-server schema 缺少创建可见用户任务所需的 threadSource 字段", {
      forkHasThreadSource: Boolean(forkProperties.threadSource),
      startHasThreadSource: Boolean(startProperties.threadSource),
    });
  }

  return {
    schemaRoot: resolved.schemaRoot,
    clientRequestPath,
    schemaSha256: await sha256File(clientRequestPath),
    methods,
    injectMethod: "thread/inject_items",
    threadSourceField: "threadSource",
    schemaSource: resolved.source,
    schemaGenerated: resolved.generated,
    codexVersion: resolved.codexVersion,
    schemaMetadataPath: resolved.metadataPath,
    threadMetadata,
  };
}
