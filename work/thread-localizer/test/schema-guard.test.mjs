import assert from "node:assert/strict";
import test from "node:test";
import { threadMetadataCapabilities } from "../src/schema-guard.mjs";

function schemaWithMetadataFields(fields) {
  return {
    oneOf: [
      {
        properties: {
          method: { enum: ["thread/metadata/update"] },
        },
      },
    ],
    definitions: {
      ThreadMetadataUpdateParams: {
        properties: Object.fromEntries(fields.map((field) => [field, { type: "string" }])),
      },
    },
  };
}

test("current metadata schema reports pinning as unsupported", () => {
  const capabilities = threadMetadataCapabilities(
    schemaWithMetadataFields(["gitInfo", "threadId"]),
  );

  assert.deepEqual(capabilities.updateFields, ["gitInfo", "threadId"]);
  assert.deepEqual(capabilities.pinning, {
    supported: false,
    method: null,
    field: null,
  });
});

test("legacy metadata schema reports the exact supported pin field", () => {
  const capabilities = threadMetadataCapabilities(
    schemaWithMetadataFields(["threadId", "isPinned"]),
  );

  assert.deepEqual(capabilities.pinning, {
    supported: true,
    method: "thread/metadata/update",
    field: "isPinned",
  });
});
