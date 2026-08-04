import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOpenAIRolloutRecords } from "../src/openai-rollout-normalizer.mjs";

function record(type, payload) {
  return { line: 1, value: { type, payload } };
}

test("normalizes DeepSeek reasoning and eight linked web search calls for OpenAI", () => {
  const callIds = Array.from({ length: 8 }, (_, index) => `call_0${index}_search`);
  const records = [
    record("response_item", { type: "reasoning", content: [{ type: "reasoning_text", text: "thinking" }] }),
    record("response_item", { type: "reasoning", content: [] }),
    ...callIds.flatMap((id, index) => [
      record("event_msg", { type: "web_search_end", call_id: id }),
      record("response_item", {
        type: "web_search_call",
        id,
        status: index % 3 === 0 ? "failed" : "completed",
        action: { type: index === 0 ? "search" : "open_page" },
      }),
    ]),
    record("response_item", { type: "web_search_call", id: "ws_native", status: "completed" }),
    record("response_item", { type: "function_call", id: "call_function", call_id: "call_function_ref" }),
    record("event_msg", { type: "tool_end", call_id: "call_function_ref" }),
  ];

  const result = normalizeOpenAIRolloutRecords(records);

  assert.equal(result.normalizedReasoningCount, 2);
  assert.equal(result.normalizedWebSearchCallIdCount, 8);
  assert.equal(result.normalizedWebSearchEventReferenceCount, 8);
  assert.equal(result.totalNormalizedCount, 18);
  assert.deepEqual(
    result.records.filter((item) => item.value.payload?.type === "web_search_call")
      .map((item) => item.value.payload.id),
    [...callIds.map((id) => id.replace(/^call_/, "ws_")), "ws_native"],
  );
  assert.deepEqual(
    result.records.filter((item) => item.value.payload?.type === "web_search_end")
      .map((item) => item.value.payload.call_id),
    callIds.map((id) => id.replace(/^call_/, "ws_")),
  );
  assert.equal(result.records[0].value.payload.content, null);
  assert.equal(result.records[1].value.payload.content, null);
  assert.equal(records[0].value.payload.content[0].text, "thinking");
  assert.equal(result.records.at(-2).value.payload.id, "call_function");
  assert.equal(result.records.at(-1).value.payload.call_id, "call_function_ref");
});

test("rejects web search IDs that collide after conversion", () => {
  const records = [
    record("response_item", { type: "web_search_call", id: "call_same" }),
    record("response_item", { type: "web_search_call", id: "ws_same" }),
  ];
  assert.throws(
    () => normalizeOpenAIRolloutRecords(records),
    /转换后冲突/,
  );
});

test("rejects missing web search IDs instead of silently handing off", () => {
  const records = [record("response_item", { type: "web_search_call", id: "" })];
  assert.throws(
    () => normalizeOpenAIRolloutRecords(records),
    /缺少可转换的字符串 ID/,
  );
});
