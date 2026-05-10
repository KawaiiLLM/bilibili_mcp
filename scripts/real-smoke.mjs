import { callTool } from "../dist/server.js";
import { getEndpoint } from "../dist/core/api-loader.js";
import { request } from "../dist/core/client.js";

const results = [];

async function main() {
  const status = await step("config.status", true, () => callTool("bilibili_config", { action: "status" }), (value) => ({
    configured: value?.configured,
    is_login: value?.login?.is_login,
  }));
  if (!status?.login?.is_login) {
    throw new Error("CookieCloud login status is not valid.");
  }

  const hot = await step("discovery.hot", true, () => callTool("bilibili_discovery", { action: "hot", limit: 1 }), compactListResult);
  const bvid = findBvid(hot);
  if (!bvid) throw new Error("Could not locate a BVID from hot videos.");

  await step("discovery.suggest", true, () => callTool("bilibili_discovery", { action: "suggest", keyword: "bilibili" }), (value) => ({
    suggestions: Array.isArray(value) ? value.slice(0, 5) : value,
  }));
  await step("ranking.rid", true, () => callTool("bilibili_discovery", { action: "ranking", rid: 0, type: "all" }), compactListResult);
  await step("ranking.rid.partition", true, () => callTool("bilibili_discovery", { action: "ranking", rid: 1, type: "all" }), compactListResult);
  await step("ranking.tid.probe", false, () => request(getEndpoint("ranking", "popular", "ranking"), { tid: 1, type: "all" }, { cache: false }), compactListResult);

  await step("video.info", true, () => callTool("bilibili_video", { action: "info", input: bvid }), compactVideo);
  await step("video.pages", true, () => callTool("bilibili_video", { action: "pages", input: bvid }), (value) => ({
    bvid: value?.bvid,
    pages: Array.isArray(value?.pages) ? value.pages.length : 0,
  }));
  await step("video.stream", true, () => callTool("bilibili_video", { action: "stream", input: bvid, quality: 64 }), compactStream);
  await step("video.snapshot", true, () => callTool("bilibili_video", { action: "snapshot", input: bvid, timestamp: 10 }), (value) => ({
    has_frame: Boolean(value?.frame?.imageUrl),
    timestamp: value?.frame?.timestamp,
  }));
  await step("video.subtitle", false, () => callTool("bilibili_video", { action: "subtitle", input: bvid }), (value) => ({
    count: Array.isArray(value?.subtitles) ? value.subtitles.length : 0,
    selected_language: value?.selected_language,
  }));
  await step("video.summary", false, () => callTool("bilibili_video", { action: "summary", input: bvid }), compactObjectKeys);
  await step("discovery.related", false, () => callTool("bilibili_discovery", { action: "related", input: bvid }), compactListResult);

  await step("interaction.comments", false, () => callTool("bilibili_interaction", { action: "comments", input: bvid, limit: 3 }), (value) => ({
    comments: Array.isArray(value?.comments) ? value.comments.length : 0,
    next_cursor: value?.cursor?.next_cursor ?? null,
  }));
  await step("interaction.danmaku", true, () => callTool("bilibili_interaction", { action: "danmaku", input: bvid, limit: 3 }), (value) => ({
    returned: value?.returned,
    truncated: value?.truncated,
  }));

  await step("write.like.dry_run", true, () => callTool("bilibili_interaction", { action: "like", input: bvid }), compactPending);
  await step("write.coin.dry_run", true, () => callTool("bilibili_interaction", { action: "coin", input: bvid, multiply: 1 }), compactPending);
  await step("write.favorite.dry_run", true, () => callTool("bilibili_interaction", { action: "favorite", input: bvid }), compactPending);
  await step("write.follow.dry_run", true, () => callTool("bilibili_interaction", { action: "follow", mid: 2 }), compactPending);

  console.log(JSON.stringify({ ok: results.every((item) => item.ok || item.optional), bvid, results }, null, 2));
  if (results.some((item) => !item.ok && !item.optional)) process.exit(1);
}

async function step(name, required, fn, summarize = compactObjectKeys) {
  try {
    const value = await fn();
    results.push({ name, ok: true, optional: !required, summary: summarize(value) });
    return value;
  } catch (error) {
    results.push({
      name,
      ok: false,
      optional: !required,
      error: error instanceof Error ? error.message : String(error),
    });
    if (required) throw error;
    return undefined;
  }
}

function compactListResult(value) {
  const list = Array.isArray(value?.list) ? value.list
    : Array.isArray(value?.items) ? value.items
      : Array.isArray(value?.result) ? value.result
        : Array.isArray(value?.data?.list) ? value.data.list
          : [];
  return {
    keys: compactObjectKeys(value).keys,
    list_count: list.length,
    first_bvid: findBvid(value),
    first_tid: findFirst(value, "tid"),
    first_title: findFirst(value, "title"),
  };
}

function compactVideo(value) {
  return {
    title: value?.title,
    bvid: value?.bvid,
    aid: value?.aid,
    cid: value?.cid,
  };
}

function compactStream(value) {
  return {
    has_dash: Boolean(value?.dash),
    durl_count: Array.isArray(value?.durl) ? value.durl.length : 0,
    quality: value?.quality,
  };
}

function compactPending(value) {
  return {
    pending: value?.pending,
    action: value?.action,
    has_token: typeof value?.confirmation_token === "string",
  };
}

function compactObjectKeys(value) {
  return value && typeof value === "object" ? { keys: Object.keys(value).slice(0, 12) } : { value };
}

function findBvid(value) {
  const found = findFirst(value, "bvid");
  return typeof found === "string" ? found : undefined;
}

function findFirst(value, key) {
  if (!value || typeof value !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirst(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  for (const child of Object.values(value)) {
    const found = findFirst(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  console.log(JSON.stringify({ ok: false, results }, null, 2));
  process.exit(1);
});
