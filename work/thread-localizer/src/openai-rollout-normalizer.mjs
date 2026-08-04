function isResponseItem(record, payloadType) {
  return record?.value?.type === "response_item"
    && record.value.payload?.type === payloadType;
}

function isWebSearchEvent(record) {
  return record?.value?.type === "event_msg"
    && typeof record.value.payload?.type === "string"
    && record.value.payload.type.startsWith("web_search_");
}

function openAIWebSearchId(sourceId) {
  if (typeof sourceId !== "string" || sourceId.length === 0) {
    throw new Error("联网搜索调用缺少可转换的字符串 ID");
  }
  if (sourceId.startsWith("ws_")) return sourceId;
  return sourceId.startsWith("call_")
    ? `ws_${sourceId.slice("call_".length)}`
    : `ws_${sourceId}`;
}

function buildWebSearchIdMap(records) {
  const allWebSearchIds = new Set();
  const replacements = new Map();
  for (const record of records) {
    if (!isResponseItem(record, "web_search_call")) continue;
    const id = record.value.payload.id;
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("联网搜索调用缺少可转换的字符串 ID");
    }
    if (allWebSearchIds.has(id)) {
      throw new Error(`联网搜索调用 ID 重复：${id}`);
    }
    allWebSearchIds.add(id);
    if (!id.startsWith("ws_")) replacements.set(id, openAIWebSearchId(id));
  }

  const replacementIds = new Set();
  for (const [sourceId, targetId] of replacements) {
    if (allWebSearchIds.has(targetId) || replacementIds.has(targetId)) {
      throw new Error(`联网搜索调用 ID 转换后冲突：${sourceId} -> ${targetId}`);
    }
    replacementIds.add(targetId);
  }
  return replacements;
}

export function normalizeOpenAIRolloutRecords(records) {
  const webSearchIdMap = buildWebSearchIdMap(records);
  let normalizedReasoningCount = 0;
  let normalizedWebSearchCallIdCount = 0;
  let normalizedWebSearchEventReferenceCount = 0;

  const normalizedRecords = records.map((record) => {
    const value = record?.value;
    if (isResponseItem(record, "reasoning") && Array.isArray(value.payload.content)) {
      normalizedReasoningCount += 1;
      return { ...record, value: { ...value, payload: { ...value.payload, content: null } } };
    }
    if (isResponseItem(record, "web_search_call") && webSearchIdMap.has(value.payload.id)) {
      normalizedWebSearchCallIdCount += 1;
      return {
        ...record,
        value: { ...value, payload: { ...value.payload, id: webSearchIdMap.get(value.payload.id) } },
      };
    }
    if (isWebSearchEvent(record) && webSearchIdMap.has(value.payload.call_id)) {
      normalizedWebSearchEventReferenceCount += 1;
      return {
        ...record,
        value: { ...value, payload: { ...value.payload, call_id: webSearchIdMap.get(value.payload.call_id) } },
      };
    }
    return record;
  });

  const remainingInvalidIds = normalizedRecords
    .filter((record) => isResponseItem(record, "web_search_call"))
    .map((record) => record.value.payload.id)
    .filter((id) => typeof id !== "string" || !id.startsWith("ws_"));
  if (remainingInvalidIds.length > 0) {
    throw new Error(`仍有 ${remainingInvalidIds.length} 个联网搜索调用 ID 不符合 OpenAI 格式`);
  }

  return {
    records: normalizedRecords,
    normalizedReasoningCount,
    normalizedWebSearchCallIdCount,
    normalizedWebSearchEventReferenceCount,
    totalNormalizedCount: normalizedReasoningCount
      + normalizedWebSearchCallIdCount
      + normalizedWebSearchEventReferenceCount,
  };
}
