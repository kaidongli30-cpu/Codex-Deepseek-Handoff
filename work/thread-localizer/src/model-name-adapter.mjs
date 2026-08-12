import http from "node:http";
import https from "node:https";
import fs from "node:fs/promises";

const PRODUCT = "Codex-DeepSeek-Handoff model-name-adapter";
const MAX_REQUEST_BYTES = 32 * 1024 * 1024;

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value == null) throw new Error(`invalid argument: ${key || "<empty>"}`);
    values[key.slice(2)] = value;
  }
  return values;
}

async function readBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_REQUEST_BYTES) throw new Error("request body exceeds 32 MiB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function copyHeaders(headers, bodyLength) {
  const result = { ...headers };
  for (const name of ["host", "connection", "content-length", "transfer-encoding"]) delete result[name];
  result["content-length"] = String(bodyLength);
  return result;
}

export function rewriteRequestBody(body, aliases) {
  const parsed = JSON.parse(body.toString("utf8"));
  if (!parsed || typeof parsed !== "object" || typeof parsed.model !== "string") {
    throw new Error("JSON request does not contain a model name");
  }
  const actualModel = aliases[parsed.model];
  if (!actualModel) throw new Error(`unsupported picker model: ${parsed.model}`);
  parsed.model = actualModel;
  return Buffer.from(JSON.stringify(parsed), "utf8");
}

export function createAdapterServer({ upstreamBaseUrl, aliases }) {
  const upstream = new URL(upstreamBaseUrl);
  const transport = upstream.protocol === "https:" ? https : http;
  if (!["http:", "https:"].includes(upstream.protocol)) throw new Error("upstream must use http or https");

  return http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/__handoff_model_adapter_health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ product: PRODUCT, pid: process.pid }));
      return;
    }

    try {
      const incomingBody = await readBody(request);
      const contentType = String(request.headers["content-type"] || "").toLowerCase();
      const outgoingBody = contentType.includes("application/json")
        ? rewriteRequestBody(incomingBody, aliases)
        : incomingBody;
      const target = new URL(request.url || "/", upstream);
      const upstreamRequest = transport.request(target, {
        method: request.method,
        headers: copyHeaders(request.headers, outgoingBody.length),
      }, (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      });
      upstreamRequest.on("error", (error) => {
        if (!response.headersSent) response.writeHead(502, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "DeepSeek upstream request failed", detail: error.message }));
      });
      upstreamRequest.end(outgoingBody);
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = Number(args.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("invalid --port");
  if (!args.upstream || !args.settings) throw new Error("--upstream and --settings are required");
  const settings = JSON.parse(await fs.readFile(args.settings, "utf8"));
  const actualToPicker = settings?.managedProviders?.deepseek?.modelAliases;
  if (!actualToPicker || typeof actualToPicker !== "object") throw new Error("DeepSeek modelAliases missing");
  const aliases = Object.fromEntries(Object.entries(actualToPicker).map(([actual, picker]) => [picker, actual]));
  const server = createAdapterServer({ upstreamBaseUrl: args.upstream, aliases });
  server.listen(port, "127.0.0.1");
  server.on("error", (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });

  const parentPid = Number(args["parent-pid"]);
  if (Number.isInteger(parentPid) && parentPid > 0) {
    const timer = setInterval(() => {
      try { process.kill(parentPid, 0); } catch { server.close(() => process.exit(0)); }
    }, 2000);
    timer.unref();
  }
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}` ||
    import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
