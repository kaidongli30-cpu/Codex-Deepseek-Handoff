import { sha256File, responseCursor, responseItems, responseThread, countVisibleMessages } from "./utils.mjs";
import { pathExists } from "./utils.mjs";

function threadFromRead(result) {
  return responseThread(result) || result?.thread || null;
}

export async function listAllItems(client, threadId) {
  const items = [];
  let cursor = null;
  const seenCursors = new Set();
  let pageCount = 0;
  try {
    for (;;) {
      const params = { threadId, limit: 100, sortDirection: "asc" };
      if (cursor) params.cursor = cursor;
      const result = await client.request("thread/items/list", params);
      pageCount += 1;
      const page = responseItems(result);
      items.push(...page);
      const next = responseCursor(result);
      if (!next || seenCursors.has(next)) break;
      seenCursors.add(next);
      cursor = next;
    }
    return {
      items,
      method: "thread/items/list",
      pageCount,
      turnCount: null,
      compatibilityFallback: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("thread/items/list is not supported yet")) throw error;
  }

  const fallbackItems = [];
  let fallbackCursor = null;
  let fallbackPageCount = 0;
  let turnCount = 0;
  const fallbackSeenCursors = new Set();
  for (;;) {
    const params = {
      threadId,
      limit: 100,
      sortDirection: "asc",
      itemsView: "full",
    };
    if (fallbackCursor) params.cursor = fallbackCursor;
    const result = await client.request("thread/turns/list", params);
    fallbackPageCount += 1;
    const turns = Array.isArray(result?.data)
      ? result.data
      : Array.isArray(result?.turns)
        ? result.turns
        : [];
    turnCount += turns.length;
    for (const turn of turns) {
      if (Array.isArray(turn?.items)) fallbackItems.push(...turn.items);
    }
    const next = responseCursor(result);
    if (!next || fallbackSeenCursors.has(next)) break;
    fallbackSeenCursors.add(next);
    fallbackCursor = next;
  }
  return {
    items: fallbackItems,
    method: "thread/turns/list(itemsView=full)",
    pageCount: fallbackPageCount,
    turnCount,
    compatibilityFallback: true,
    fallbackReason: "thread/items/list is not supported yet",
  };
}

export async function verifyThread(client, threadId) {
  const readResult = await client.request("thread/read", { threadId, includeTurns: true });
  const thread = threadFromRead(readResult);
  const listing = await listAllItems(client, threadId);
  const items = listing.items;
  const rolloutPath = thread?.path || null;
  const rolloutSha256 = rolloutPath && await pathExists(rolloutPath) ? await sha256File(rolloutPath) : null;
  return {
    threadId,
    name: thread?.name || null,
    threadSource: thread?.threadSource || null,
    cwd: thread?.cwd || null,
    rolloutPath,
    rolloutSha256,
    turnCount: Array.isArray(thread?.turns) ? thread.turns.length : null,
    itemCount: items.length,
    visibleMessageCount: countVisibleMessages(items),
    itemVerification: {
      method: listing.method,
      pageCount: listing.pageCount,
      turnCount: listing.turnCount,
      compatibilityFallback: listing.compatibilityFallback,
      fallbackReason: listing.fallbackReason || null,
    },
  };
}
