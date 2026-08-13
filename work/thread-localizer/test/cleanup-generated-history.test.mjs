import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { assertChildPath, manifestPredecessors } from "../src/cleanup-generated-history.mjs";

test("cleanup selects only recorded predecessors and never current task ids", () => {
  const result = manifestPredecessors({
    tasks: [{
      currentThreadId: "current",
      handoffs: [
        { sourceThreadId: "old-archived", sourceArchived: true },
        { sourceThreadId: "old-pending", sourceDeleted: false },
        { sourceThreadId: "current", sourceArchived: true },
        { sourceThreadId: "untracked-state" },
      ],
    }],
  });
  assert.deepEqual([...result], ["old-archived", "old-pending"]);
});

test("cleanup path guard accepts a child and rejects parent or sibling paths", () => {
  const root = path.resolve("C:/Users/test/.codex/backups");
  const child = path.join(root, "thread-localizer-123");
  assert.equal(assertChildPath(root, child), child);
  assert.throws(() => assertChildPath(root, root), /拒绝处理/);
  assert.throws(() => assertChildPath(root, path.resolve(root, "..", "sessions")), /拒绝处理/);
});
