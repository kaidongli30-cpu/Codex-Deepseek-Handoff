import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { buildPickerCatalog } from "../src/build-picker-catalog.mjs";
import { createAdapterServer, rewriteRequestBody } from "../src/model-name-adapter.mjs";

const actualToPicker = {
  "deepseek-v4-flash": "gpt-5.6-terra",
  "deepseek-v4-pro": "gpt-5.6-sol",
};
const pickerToActual = Object.fromEntries(Object.entries(actualToPicker).map(([actual, picker]) => [picker, actual]));

test("picker catalog keeps DeepSeek capabilities while using allowlisted runtime slugs", () => {
  const source = {
    models: [
      { slug: "deepseek-v4-flash", display_name: "DeepSeek-V4-Flash", supported_reasoning_levels: [{ effort: "max" }] },
      { slug: "deepseek-v4-pro", display_name: "DeepSeek-V4-Pro", supported_reasoning_levels: [{ effort: "max" }] },
    ],
  };
  const result = buildPickerCatalog(source, { managedProviders: { deepseek: { modelAliases: actualToPicker } } });
  assert.deepEqual(result.models.map((model) => [model.slug, model.display_name]), [
    ["gpt-5.6-terra", "DeepSeek-V4-Flash"],
    ["gpt-5.6-sol", "DeepSeek-V4-Pro"],
  ]);
});

test("request rewrite changes only the model field", () => {
  const original = { model: "gpt-5.6-sol", input: [{ role: "user", content: [{ type: "input_text", text: "keep me" }] }] };
  const rewritten = JSON.parse(rewriteRequestBody(Buffer.from(JSON.stringify(original)), pickerToActual));
  assert.equal(rewritten.model, "deepseek-v4-pro");
  assert.deepEqual(rewritten.input, original.input);
});

test("adapter streams the upstream response and preserves request content", async (context) => {
  let received;
  const upstream = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write("data: first\n\n");
    response.end("data: second\n\n");
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  context.after(() => upstream.close());
  const upstreamPort = upstream.address().port;

  const adapter = createAdapterServer({ upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}`, aliases: pickerToActual });
  await new Promise((resolve) => adapter.listen(0, "127.0.0.1", resolve));
  context.after(() => adapter.close());
  const adapterPort = adapter.address().port;

  const payload = { model: "gpt-5.6-terra", input: [{ role: "user", content: [{ type: "input_text", text: "unchanged" }] }] };
  const response = await fetch(`http://127.0.0.1:${adapterPort}/responses`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-only" },
    body: JSON.stringify(payload),
  });
  assert.equal(await response.text(), "data: first\n\ndata: second\n\n");
  assert.equal(received.model, "deepseek-v4-flash");
  assert.deepEqual(received.input, payload.input);
});
