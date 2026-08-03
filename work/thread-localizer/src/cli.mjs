import { createAppServerClient } from "./appserver-client.mjs";
import { DEFAULT_PROVIDER, DEEPSEEK_MODEL, PROJECT_CWD } from "./constants.mjs";
import { loadAndValidateSchema } from "./schema-guard.mjs";
import { parseArgs } from "./utils.mjs";
import { verifyThread } from "./verify-mirror.mjs";
import { handoffOne, rollingHandoff } from "./handoff-engine.mjs";
import { batchHandoff, discoverLocalTasks } from "./batch-handoff-engine.mjs";

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  const command = positionals[0] || "help";
  if (command === "help") {
    process.stdout.write("用法: node src/cli.mjs schema-check | batch-inventory | batch-handoff-dry-run --target-provider P [--only-task-id ID] | batch-handoff --execute --target-provider P [--only-task-id ID] | handoff-dry-run ... | rolling-handoff-dry-run ... | verify ...\n");
    return;
  }
  if (command === "schema-check") {
    print(await loadAndValidateSchema());
    return;
  }
  if (command === "batch-inventory") {
    print({ type: "batch-inventory", tasks: await discoverLocalTasks() });
    return;
  }
  if (command === "batch-handoff-dry-run" || command === "batch-handoff") {
    if (command === "batch-handoff" && options.execute !== true && options.execute !== "true") {
      throw new Error("batch-handoff 必须显式带 --execute");
    }
    const targetProvider = options["target-provider"] || DEFAULT_PROVIDER;
    print(await batchHandoff({
      execute: command === "batch-handoff",
      targetProvider,
      onlyTaskId: options["only-task-id"] || null,
    }));
    return;
  }
  if (command === "handoff-dry-run" || command === "handoff") {
    if (command === "handoff" && options.execute !== true && options.execute !== "true") {
      throw new Error("handoff 必须显式带 --execute");
    }
    const targetProvider = options["target-provider"] || DEFAULT_PROVIDER;
    print(await handoffOne({
      execute: command === "handoff",
      sourceThreadId: options["source-thread-id"],
      targetProvider,
      targetModel: options["target-model"] || (targetProvider === "deepseek" ? DEEPSEEK_MODEL : null),
      targetName: options.name,
      testMode: options["test-mode"] === true || options["test-mode"] === "true",
    }));
    return;
  }
  if (command === "rolling-handoff-dry-run" || command === "rolling-handoff") {
    if (command === "rolling-handoff" && options.execute !== true && options.execute !== "true") {
      throw new Error("rolling-handoff 必须显式带 --execute");
    }
    const targetProvider = options["target-provider"] || DEFAULT_PROVIDER;
    print(await rollingHandoff({
      execute: command === "rolling-handoff",
      targetProvider,
      targetModel: options["target-model"] || (targetProvider === "deepseek" ? DEEPSEEK_MODEL : "gpt-5.6-sol"),
    }));
    return;
  }
  if (command === "verify") {
    const threadId = options["thread-id"] || options.threadId;
    if (!threadId) throw new Error("verify 需要 --thread-id");
    const provider = options.provider || DEFAULT_PROVIDER;
    const client = await createAppServerClient({
      cwd: PROJECT_CWD,
      configOverrides: provider === "deepseek" ? {
        model_provider: "deepseek",
        model: options.model || DEEPSEEK_MODEL,
        forced_login_method: "api",
      } : {},
    });
    try {
      print(await verifyThread(client, threadId));
    } finally {
      await client.close();
    }
    return;
  }
  throw new Error(`未知命令: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
