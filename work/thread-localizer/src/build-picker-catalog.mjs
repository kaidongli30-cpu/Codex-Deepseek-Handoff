import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value == null) throw new Error(`无效参数: ${key || "<empty>"}`);
    values[key.slice(2)] = value;
  }
  return values;
}

export function buildPickerCatalog(sourceCatalog, settings) {
  const aliases = settings?.managedProviders?.deepseek?.modelAliases;
  if (!aliases || typeof aliases !== "object") throw new Error("DeepSeek 配置缺少 modelAliases");
  const sourceModels = Array.isArray(sourceCatalog?.models) ? sourceCatalog.models : [];
  const models = [];
  for (const [actualModel, pickerModel] of Object.entries(aliases)) {
    const source = sourceModels.find((model) => model?.slug === actualModel);
    if (!source) throw new Error(`官方 DeepSeek 模型目录缺少 ${actualModel}`);
    models.push({ ...structuredClone(source), slug: pickerModel });
  }
  return { ...sourceCatalog, models };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const name of ["source", "settings", "output"]) {
    if (!args[name]) throw new Error(`缺少 --${name}`);
  }
  const [sourceCatalog, settings] = await Promise.all([
    fs.readFile(path.resolve(args.source), "utf8").then(JSON.parse),
    fs.readFile(path.resolve(args.settings), "utf8").then(JSON.parse),
  ]);
  const output = buildPickerCatalog(sourceCatalog, settings);
  await fs.writeFile(path.resolve(args.output), `${JSON.stringify(output, null, 2)}\n`, "utf8");
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}` ||
    import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
