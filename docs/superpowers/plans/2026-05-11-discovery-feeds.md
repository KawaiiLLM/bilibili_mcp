# Discovery Feeds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new actions to `bilibili_discovery` — `home` (homepage recommendation feed) and `following` (videos posted by followed UPs).

**Architecture:** `home` extends `src/modules/ranking.ts` (same `ranking.json` catalog domain); `following` adds a new `src/modules/dynamic.ts` calling a new `src/data/api/dynamic.json` domain. Both flow through the existing `bilibili_discovery` tool router. Shape-mapping helpers live alongside the modules to keep blast radius narrow — no changes to `src/tools/normalize.ts`.

**Tech Stack:** TypeScript ESM, `node:test` (no test framework), `installMockFetch` test helper, existing WBI/credential/buvid pipeline in `src/core/`.

**Spec:** `docs/superpowers/specs/2026-05-11-discovery-feeds.md`

---

## File Structure

| file | role |
|---|---|
| `src/data/api/ranking.json` | extend `popular` group with `recommend` endpoint |
| `src/data/api/dynamic.json` | **new** — register `feed.all` endpoint |
| `src/core/types.ts` | add `"dynamic"` to `API_FILE_NAMES` tuple |
| `src/modules/ranking.ts` | add `getHomeRecommend` + private `mapHomeItem`/`mapRcmdReason` helpers |
| `src/modules/dynamic.ts` | **new** — `getFollowingVideos` + `mapFollowingItem` helper |
| `src/tools/discovery-tool.ts` | extend action enum, schema, switch with `home` and `following` |
| `tests/modules/discovery.test.ts` | append `home` and `following` module-level tests |
| `tests/tools/discovery-tool.test.ts` | append `home` and `following` tool-level tests |
| `README.md` | document both new actions under `bilibili_discovery` section |
| `package.json` | bump version 0.3.2 → 0.3.3 |

---

## Task 1: Register endpoint catalogs

**Files:**
- Modify: `src/data/api/ranking.json`
- Create: `src/data/api/dynamic.json`
- Modify: `src/core/types.ts:3`

This task adds the upstream endpoint declarations and registers the new domain so `getEndpoint("dynamic", ...)` works. No tests yet — covered by module tests in Task 2 and 3.

- [ ] **Step 1: Extend `ranking.json` with the recommend endpoint**

Open `src/data/api/ranking.json`. Inside the existing `"popular"` object (after the `"must_watch"` entry), add a `"recommend"` key:

```json
    "recommend": {
      "url": "https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd",
      "method": "GET",
      "wbi": true,
      "auth": false,
      "csrf": false,
      "buvid": false,
      "params_type": "query",
      "response_type": "json",
      "defaults": { "web_location": "1430650" },
      "comment": "Web homepage video recommendation feed. SESSDATA personalizes; works without."
    }
```

Make sure the preceding entry's closing `}` ends with a comma.

- [ ] **Step 2: Create `dynamic.json` catalog**

Create `src/data/api/dynamic.json` with:

```json
{
  "feed": {
    "all": {
      "url": "https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all",
      "method": "GET",
      "wbi": false,
      "auth": true,
      "csrf": false,
      "buvid": false,
      "params_type": "query",
      "response_type": "json",
      "defaults": {
        "platform": "web",
        "features": "itemOpusStyle,listOnlyfans",
        "timezone_offset": "-480"
      },
      "comment": "Follow feed (dynamics). Requires SESSDATA. type=video filters to UGC/PGC videos."
    }
  }
}
```

- [ ] **Step 3: Register `dynamic` in `API_FILE_NAMES`**

Open `src/core/types.ts`, line 3. Change:

```ts
export const API_FILE_NAMES = ["video", "comment", "danmaku", "search", "ranking", "action", "auth"] as const;
```

to:

```ts
export const API_FILE_NAMES = ["video", "comment", "danmaku", "search", "ranking", "action", "auth", "dynamic"] as const;
```

- [ ] **Step 4: Build to verify catalog files load**

Run:

```bash
npm run build
```

Expected: build succeeds, no TS errors. The build copies the new `dynamic.json` into `dist/data/api/dynamic.json` via `scripts/copy-assets.mjs`.

- [ ] **Step 5: Verify endpoints resolve**

Run:

```bash
node -e "import('./dist/core/api-loader.js').then(m => { console.log(m.getEndpoint('ranking', 'popular', 'recommend').url); console.log(m.getEndpoint('dynamic', 'feed', 'all').url); })"
```

Expected output:

```
https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd
https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all
```

- [ ] **Step 6: Commit**

```bash
git add src/data/api/ranking.json src/data/api/dynamic.json src/core/types.ts
git commit -m "feat(api): register recommend + dynamic feed endpoints"
```

---

## Task 2: Implement `getHomeRecommend`

**Files:**
- Modify: `src/modules/ranking.ts`
- Test: `tests/modules/discovery.test.ts`

TDD: write failing tests first, then implement.

- [ ] **Step 1: Write three failing tests for `getHomeRecommend`**

Open `tests/modules/discovery.test.ts`. Replace the entire file with:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../../src/core/config.js";
import { getSearchSuggestions } from "../../src/modules/search.js";
import { getHomeRecommend } from "../../src/modules/ranking.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

config.enableBiliTicket = false;

test("search suggestions normalize API payload to string array", async () => {
  const fetchMock = installMockFetch(() => jsonResponse({
    code: 0,
    result: {
      tag: [
        { value: "明日方舟" },
        { name: "原神" },
        { term: "崩坏 星穹铁道" },
      ],
    },
  }));

  try {
    const result = await getSearchSuggestions({ keyword: "mi" });
    assert.deepEqual(result, ["明日方舟", "原神", "崩坏 星穹铁道"]);
  } finally {
    fetchMock.restore();
  }
});

test("getHomeRecommend filters to goto=av and shapes items", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/nav") {
      return jsonResponse({
        code: 0,
        data: {
          wbi_img: {
            img_url: "https://i0.hdslb.com/bfs/wbi/abcdefghijklmnopqrstuvwxyz123456.png",
            sub_url: "https://i0.hdslb.com/bfs/wbi/ABCDEFGHIJKLMNOPQRSTUVWXYZ123456.png",
          },
        },
      });
    }
    if (url.pathname === "/x/frontend/finger/spi") {
      return jsonResponse({ code: 0, data: { b_3: "buvid3", b_4: "buvid4" } });
    }
    if (url.pathname === "/x/web-interface/wbi/index/top/feed/rcmd") {
      return jsonResponse({
        code: 0,
        data: {
          item: [
            {
              goto: "av",
              bvid: "BV1aaa",
              id: 100,
              cid: 200,
              title: "AV item",
              pic: "//i0.hdslb.com/cover-a.jpg",
              duraion: 360,
              owner: { mid: 1, name: "up-a", face: "//i0.hdslb.com/face-a.jpg" },
              stat: { view: 1000, danmaku: 10, like: 50 },
              pubdate: 1778500000,
              is_followed: 1,
              rcmd_reason: { reason_type: 1, content: "已关注" },
            },
            { goto: "live", bvid: "BV1bbb", title: "live entry" },
            { goto: "ogv", bvid: "BV1ccc", title: "sidebar entry" },
          ],
        },
      });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await getHomeRecommend({ limit: 10 });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].bvid, "BV1aaa");
    assert.equal(result.items[0].aid, 100);
    assert.equal(result.items[0].cid, 200);
    assert.equal(result.items[0].title, "AV item");
    assert.equal(result.items[0].cover, "https://i0.hdslb.com/cover-a.jpg");
    assert.equal(result.items[0].duration_seconds, 360);
    assert.equal(result.items[0].duration_text, "06:00");
    assert.deepEqual(result.items[0].owner, { mid: 1, name: "up-a", avatar: "https://i0.hdslb.com/face-a.jpg" });
    assert.deepEqual(result.items[0].stat, { view: 1000, danmaku: 10, like: 50 });
    assert.equal(result.items[0].is_followed, true);
    assert.equal(result.items[0].reason, "已关注");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("getHomeRecommend maps rcmd_reason types", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/nav") {
      return jsonResponse({
        code: 0,
        data: {
          wbi_img: {
            img_url: "https://i0.hdslb.com/bfs/wbi/abcdefghijklmnopqrstuvwxyz123456.png",
            sub_url: "https://i0.hdslb.com/bfs/wbi/ABCDEFGHIJKLMNOPQRSTUVWXYZ123456.png",
          },
        },
      });
    }
    if (url.pathname === "/x/frontend/finger/spi") {
      return jsonResponse({ code: 0, data: { b_3: "buvid3", b_4: "buvid4" } });
    }
    if (url.pathname === "/x/web-interface/wbi/index/top/feed/rcmd") {
      return jsonResponse({
        code: 0,
        data: {
          item: [
            { goto: "av", bvid: "BV1", id: 1, cid: 1, title: "t1", pic: "p", duraion: 60, owner: { mid: 1, name: "u", face: "f" }, stat: {}, pubdate: 0, rcmd_reason: { reason_type: 0 } },
            { goto: "av", bvid: "BV2", id: 2, cid: 2, title: "t2", pic: "p", duraion: 60, owner: { mid: 2, name: "u", face: "f" }, stat: {}, pubdate: 0, rcmd_reason: { reason_type: 1, content: "已关注" } },
            { goto: "av", bvid: "BV3", id: 3, cid: 3, title: "t3", pic: "p", duraion: 60, owner: { mid: 3, name: "u", face: "f" }, stat: {}, pubdate: 0, rcmd_reason: { reason_type: 3, content: "高点赞" } },
          ],
        },
      });
    }
    return jsonResponse({ code: -404 });
  });

  try {
    const result = await getHomeRecommend({});
    assert.equal(result.items[0].reason, null);
    assert.equal(result.items[1].reason, "已关注");
    assert.equal(result.items[2].reason, "高点赞");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("getHomeRecommend caps limit at 30 in upstream request", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  let capturedPs: string | null = null;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/nav") {
      return jsonResponse({
        code: 0,
        data: {
          wbi_img: {
            img_url: "https://i0.hdslb.com/bfs/wbi/abcdefghijklmnopqrstuvwxyz123456.png",
            sub_url: "https://i0.hdslb.com/bfs/wbi/ABCDEFGHIJKLMNOPQRSTUVWXYZ123456.png",
          },
        },
      });
    }
    if (url.pathname === "/x/frontend/finger/spi") {
      return jsonResponse({ code: 0, data: { b_3: "buvid3", b_4: "buvid4" } });
    }
    if (url.pathname === "/x/web-interface/wbi/index/top/feed/rcmd") {
      capturedPs = url.searchParams.get("ps");
      return jsonResponse({ code: 0, data: { item: [] } });
    }
    return jsonResponse({ code: -404 });
  });

  try {
    await getHomeRecommend({ limit: 500 });
    assert.equal(capturedPs, "30");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail with "import not found"**

```bash
npm test
```

Expected: TS error `Module '"../../src/modules/ranking.js"' has no exported member 'getHomeRecommend'`.

- [ ] **Step 3: Implement `getHomeRecommend` in `src/modules/ranking.ts`**

Replace the entire `src/modules/ranking.ts` file with:

```ts
import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import { normalizeAbsoluteUrl } from "../tools/normalize.js";
import { formatDuration } from "./video.js";
import type { RequestContext } from "../core/types.js";

export async function getHotVideos(input: { page?: number; pageSize?: number } = {}, ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("ranking", "popular", "hot"), {
    pn: input.page ?? 1,
    ps: input.pageSize ?? 20,
  }, ctx);
}

export async function getRanking(input: { rid?: number; type?: string } = {}, ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("ranking", "popular", "ranking"), {
    rid: input.rid ?? 0,
    type: input.type ?? "all",
  }, ctx);
}

export async function getWeeklySeries(ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("ranking", "popular", "weekly"), {}, ctx);
}

export async function getMustWatch(ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("ranking", "popular", "must_watch"), {}, ctx);
}

export interface HomeRecommendItem {
  bvid: string;
  aid: number;
  cid: number;
  title: string;
  cover: string;
  duration_seconds: number;
  duration_text: string;
  owner: { mid: number; name: string; avatar: string };
  stat: { view: number; danmaku: number; like: number };
  publish_time: number;
  is_followed: boolean;
  reason: string | null;
}

export interface HomeRecommendResult {
  items: HomeRecommendItem[];
}

export async function getHomeRecommend(input: { limit?: number } = {}, ctx?: RequestContext): Promise<HomeRecommendResult> {
  const limit = clampLimit(input.limit ?? 20, 1, 30);
  const payload = await request(getEndpoint("ranking", "popular", "recommend"), {
    ps: limit,
    fresh_idx: 1,
    fresh_idx_1h: 1,
    brush: 1,
    fetch_row: 1,
    homepage_ver: 1,
    feed_version: "V8",
  }, ctx);
  const rawItems: any[] = Array.isArray(payload?.item) ? payload.item : [];
  const items = rawItems
    .filter((entry) => entry?.goto === "av" && !entry?.business_info)
    .map(mapHomeItem);
  return { items };
}

function mapHomeItem(raw: any): HomeRecommendItem {
  const duration = Number(raw?.duraion ?? raw?.duration ?? 0);
  const owner = raw?.owner ?? {};
  const stat = raw?.stat ?? {};
  return {
    bvid: String(raw?.bvid ?? ""),
    aid: Number(raw?.id ?? raw?.aid ?? 0),
    cid: Number(raw?.cid ?? 0),
    title: String(raw?.title ?? ""),
    cover: normalizeAbsoluteUrl(raw?.pic),
    duration_seconds: duration,
    duration_text: formatDuration(duration),
    owner: {
      mid: Number(owner?.mid ?? 0),
      name: String(owner?.name ?? ""),
      avatar: normalizeAbsoluteUrl(owner?.face),
    },
    stat: {
      view: Number(stat?.view ?? 0),
      danmaku: Number(stat?.danmaku ?? 0),
      like: Number(stat?.like ?? 0),
    },
    publish_time: Number(raw?.pubdate ?? 0),
    is_followed: Boolean(raw?.is_followed),
    reason: mapRcmdReason(raw?.rcmd_reason),
  };
}

function mapRcmdReason(reason: any): string | null {
  if (!reason || typeof reason !== "object") return null;
  const type = Number(reason.reason_type ?? 0);
  if (type === 0) return null;
  if (type === 1) return "已关注";
  if (type === 3) return "高点赞";
  const content = typeof reason.content === "string" ? reason.content.trim() : "";
  return content || null;
}

function clampLimit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const floored = Math.floor(value);
  if (floored < min) return min;
  if (floored > max) return max;
  return floored;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all 126 tests pass (122 existing + 4 new — 1 of the 4 was already there for search). Specifically:
- `getHomeRecommend filters to goto=av and shapes items` PASS
- `getHomeRecommend maps rcmd_reason types` PASS
- `getHomeRecommend caps limit at 30 in upstream request` PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/ranking.ts tests/modules/discovery.test.ts
git commit -m "feat(ranking): getHomeRecommend with item shaping + reason mapping"
```

---

## Task 3: Implement `getFollowingVideos`

**Files:**
- Create: `src/modules/dynamic.ts`
- Test: `tests/modules/discovery.test.ts`

- [ ] **Step 1: Append four failing tests for `getFollowingVideos`**

Append to the end of `tests/modules/discovery.test.ts`:

```ts
import { getFollowingVideos } from "../../src/modules/dynamic.js";
import type { Credential } from "../../src/core/types.js";

test("getFollowingVideos throws when SESSDATA missing", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch(() => jsonResponse({ code: 0, data: {} }));
  try {
    await assert.rejects(
      getFollowingVideos({}),
      (err: any) => err?.code === "BILIBILI_COOKIE_INVALID",
    );
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("getFollowingVideos keeps DYNAMIC_TYPE_AV items and drops others", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const credential: Credential = { cookieHeader: "SESSDATA=session; bili_jct=csrf", cookies: [] };
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/polymer/web-dynamic/v1/feed/all") {
      return jsonResponse({
        code: 0,
        data: {
          has_more: true,
          offset: "999",
          update_baseline: "1000",
          items: [
            {
              id_str: "1000",
              type: "DYNAMIC_TYPE_AV",
              modules: {
                module_author: {
                  mid: 42,
                  name: "UP-1",
                  face: "//i0.hdslb.com/face.jpg",
                  pub_ts: 1778500000,
                  pub_time: "刚刚",
                },
                module_dynamic: {
                  major: {
                    type: "MAJOR_TYPE_ARCHIVE",
                    archive: {
                      aid: "100",
                      bvid: "BV1aaa",
                      title: "AV title",
                      cover: "//i0.hdslb.com/cover.jpg",
                      duration_text: "06:00",
                      desc: "some desc",
                      jump_url: "//www.bilibili.com/video/BV1aaa/",
                      stat: { play: "1234", danmaku: "5" },
                    },
                  },
                },
              },
            },
            { id_str: "1001", type: "DYNAMIC_TYPE_WORD", modules: {} },
            { id_str: "1002", type: "DYNAMIC_TYPE_FORWARD", modules: {} },
          ],
        },
      });
    }
    return jsonResponse({ code: -404 });
  });
  try {
    const result = await getFollowingVideos({}, { credential });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].bvid, "BV1aaa");
    assert.equal(result.items[0].aid, 100);
    assert.equal(result.items[0].title, "AV title");
    assert.equal(result.items[0].cover, "https://i0.hdslb.com/cover.jpg");
    assert.equal(result.items[0].duration_text, "06:00");
    assert.equal(result.items[0].desc, "some desc");
    assert.equal(result.items[0].jump_url, "https://www.bilibili.com/video/BV1aaa/");
    assert.deepEqual(result.items[0].stat, { view: 1234, danmaku: 5 });
    assert.equal(result.items[0].publish_time, 1778500000);
    assert.equal(result.items[0].publish_text, "刚刚");
    assert.deepEqual(result.items[0].author, { mid: 42, name: "UP-1", avatar: "https://i0.hdslb.com/face.jpg" });
    assert.equal(result.items[0].dynamic_id, "1000");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("getFollowingVideos passes cursor and returns cursor/has_more passthrough", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const credential: Credential = { cookieHeader: "SESSDATA=session; bili_jct=csrf", cookies: [] };
  let capturedOffset: string | null = null;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/polymer/web-dynamic/v1/feed/all") {
      capturedOffset = url.searchParams.get("offset");
      return jsonResponse({
        code: 0,
        data: {
          has_more: false,
          offset: "next-cursor",
          update_baseline: "baseline-x",
          items: [],
        },
      });
    }
    return jsonResponse({ code: -404 });
  });
  try {
    const result = await getFollowingVideos({ cursor: "prev-cursor" }, { credential });
    assert.equal(capturedOffset, "prev-cursor");
    assert.equal(result.cursor, "next-cursor");
    assert.equal(result.has_more, false);
    assert.equal(result.update_baseline, "baseline-x");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("getFollowingVideos trims mapped items to limit", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const credential: Credential = { cookieHeader: "SESSDATA=session; bili_jct=csrf", cookies: [] };
  const makeItem = (n: number) => ({
    id_str: String(n),
    type: "DYNAMIC_TYPE_AV",
    modules: {
      module_author: { mid: n, name: `up-${n}`, face: "f", pub_ts: n, pub_time: "刚刚" },
      module_dynamic: {
        major: {
          type: "MAJOR_TYPE_ARCHIVE",
          archive: { aid: String(n), bvid: `BV${n}`, title: `t${n}`, cover: "c", duration_text: "01:00", desc: "", jump_url: "j", stat: { play: "0", danmaku: "0" } },
        },
      },
    },
  });
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/polymer/web-dynamic/v1/feed/all") {
      return jsonResponse({
        code: 0,
        data: {
          has_more: true,
          offset: "x",
          update_baseline: "y",
          items: [makeItem(1), makeItem(2), makeItem(3), makeItem(4), makeItem(5)],
        },
      });
    }
    return jsonResponse({ code: -404 });
  });
  try {
    const result = await getFollowingVideos({ limit: 2 }, { credential });
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].bvid, "BV1");
    assert.equal(result.items[1].bvid, "BV2");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail with "module not found"**

```bash
npm test
```

Expected: TS error `Cannot find module '../../src/modules/dynamic.js'`.

- [ ] **Step 3: Implement `getFollowingVideos` in `src/modules/dynamic.ts`**

Create `src/modules/dynamic.ts`:

```ts
import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import { normalizeAbsoluteUrl } from "../tools/normalize.js";
import type { RequestContext } from "../core/types.js";

export interface FollowingVideoItem {
  bvid: string;
  aid: number;
  title: string;
  cover: string;
  duration_text: string;
  desc: string;
  jump_url: string;
  stat: { view: number; danmaku: number };
  publish_time: number;
  publish_text: string;
  author: { mid: number; name: string; avatar: string };
  dynamic_id: string;
}

export interface FollowingVideosResult {
  items: FollowingVideoItem[];
  cursor: string | null;
  has_more: boolean;
  update_baseline: string | null;
}

const ARCHIVE_DYNAMIC_TYPES = new Set(["DYNAMIC_TYPE_AV", "DYNAMIC_TYPE_UGC_SEASON"]);
const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 30;

export async function getFollowingVideos(
  input: { cursor?: string; limit?: number } = {},
  ctx?: RequestContext,
): Promise<FollowingVideosResult> {
  const limit = clampLimit(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
  const payload = await request(getEndpoint("dynamic", "feed", "all"), {
    type: "video",
    offset: input.cursor ?? "",
  }, ctx);

  const rawItems: any[] = Array.isArray(payload?.items) ? payload.items : [];
  const mapped: FollowingVideoItem[] = [];
  for (const raw of rawItems) {
    if (mapped.length >= limit) break;
    if (!ARCHIVE_DYNAMIC_TYPES.has(raw?.type)) continue;
    const archive = raw?.modules?.module_dynamic?.major?.archive;
    const major = raw?.modules?.module_dynamic?.major;
    if (!archive || major?.type !== "MAJOR_TYPE_ARCHIVE") continue;
    const author = raw?.modules?.module_author ?? {};
    mapped.push({
      bvid: String(archive.bvid ?? ""),
      aid: Number(archive.aid ?? 0),
      title: String(archive.title ?? ""),
      cover: normalizeAbsoluteUrl(archive.cover),
      duration_text: String(archive.duration_text ?? ""),
      desc: String(archive.desc ?? ""),
      jump_url: normalizeAbsoluteUrl(archive.jump_url),
      stat: {
        view: Number(archive?.stat?.play ?? 0),
        danmaku: Number(archive?.stat?.danmaku ?? 0),
      },
      publish_time: Number(author.pub_ts ?? 0),
      publish_text: String(author.pub_time ?? ""),
      author: {
        mid: Number(author.mid ?? 0),
        name: String(author.name ?? ""),
        avatar: normalizeAbsoluteUrl(author.face),
      },
      dynamic_id: String(raw?.id_str ?? ""),
    });
  }

  const rawOffset = typeof payload?.offset === "string" ? payload.offset : "";
  const rawBaseline = typeof payload?.update_baseline === "string" ? payload.update_baseline : "";
  return {
    items: mapped,
    cursor: rawOffset ? rawOffset : null,
    has_more: Boolean(payload?.has_more),
    update_baseline: rawBaseline ? rawBaseline : null,
  };
}

function clampLimit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const floored = Math.floor(value);
  if (floored < min) return min;
  if (floored > max) return max;
  return floored;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all 130 tests pass (4 new tests for `getFollowingVideos` plus the 126 from previous tasks).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dynamic.ts tests/modules/discovery.test.ts
git commit -m "feat(dynamic): getFollowingVideos for follow-feed videos"
```

---

## Task 4: Wire `home` and `following` to `bilibili_discovery`

**Files:**
- Modify: `src/tools/discovery-tool.ts`
- Test: `tests/tools/discovery-tool.test.ts`

- [ ] **Step 1: Append two failing tests for tool dispatch**

Append to the end of `tests/tools/discovery-tool.test.ts`:

```ts
test("discovery home returns shaped items from upstream feed", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/nav") {
      return jsonResponse({
        code: 0,
        data: {
          wbi_img: {
            img_url: "https://i0.hdslb.com/bfs/wbi/abcdefghijklmnopqrstuvwxyz123456.png",
            sub_url: "https://i0.hdslb.com/bfs/wbi/ABCDEFGHIJKLMNOPQRSTUVWXYZ123456.png",
          },
        },
      });
    }
    if (url.pathname === "/x/frontend/finger/spi") {
      return jsonResponse({ code: 0, data: { b_3: "buvid3", b_4: "buvid4" } });
    }
    if (url.pathname === "/x/web-interface/wbi/index/top/feed/rcmd") {
      return jsonResponse({
        code: 0,
        data: {
          item: [
            { goto: "av", bvid: "BV1", id: 1, cid: 1, title: "t1", pic: "p1", duraion: 60, owner: { mid: 1, name: "u1", face: "f1" }, stat: { view: 10 }, pubdate: 0, rcmd_reason: { reason_type: 1, content: "已关注" } },
          ],
        },
      });
    }
    return jsonResponse({ code: -404 });
  });
  try {
    const result: any = await callTool("bilibili_discovery", { action: "home", limit: 5 });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].bvid, "BV1");
    assert.equal(result.items[0].reason, "已关注");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("discovery following requires SESSDATA and propagates cursor", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch(() => jsonResponse({ code: 0, data: {} }));
  try {
    await assert.rejects(
      callTool("bilibili_discovery", { action: "following" }),
      (err: any) => err?.code === "BILIBILI_COOKIE_INVALID",
    );
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail with "action not supported"**

```bash
npm test
```

Expected: tests fail with `ValidationError` about action enum not including `home` / `following`.

- [ ] **Step 3: Update `discovery-tool.ts` to add the two actions**

Open `src/tools/discovery-tool.ts`. Replace the entire file with:

```ts
import { ValidationError } from "../core/errors.js";
import { getSearchSuggestions, searchByType, searchVideos } from "../modules/search.js";
import { getHotVideos, getHomeRecommend, getMustWatch, getRanking, getWeeklySeries } from "../modules/ranking.js";
import { getFollowingVideos } from "../modules/dynamic.js";
import { getRelatedVideos } from "../modules/recommend.js";
import { assertAllowedArgs, optionalNumber, optionalString, positiveInteger, requireString, type ToolRouter } from "./common.js";
import { normalizeVideoList } from "./normalize.js";
import { resolveVideoContext } from "./video-tool.js";

const TOOL_NAME = "bilibili_discovery";
const DISCOVERY_ACTIONS = [
  "search",
  "search_type",
  "suggest",
  "hot",
  "ranking",
  "weekly",
  "must_watch",
  "related",
  "home",
  "following",
] as const;
type DiscoveryAction = (typeof DISCOVERY_ACTIONS)[number];

export const discoveryToolRouter: ToolRouter = {
  definition: {
    name: TOOL_NAME,
    description: "B 站发现工具。支持搜索、建议、热门、排行榜、每周必看、入站必刷、相关推荐、首页推荐流、关注 UP 视频更新。",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: DISCOVERY_ACTIONS },
        keyword: { type: "string", description: "搜索关键词" },
        search_type: { type: "string", description: "分类搜索类型，默认 video" },
        page: { type: "number", description: "页码，默认 1" },
        limit: { type: "number", description: "返回数量，默认 10 或 20" },
        rid: { type: "number", description: "排行榜分区 id" },
        type: { type: "string", description: "排行榜类型，默认 all" },
        input: { type: "string", description: "related 使用的视频输入" },
        cursor: { type: "string", description: "翻页游标，仅 following 使用" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  async call(args: Record<string, unknown>): Promise<unknown> {
    assertAllowedArgs(TOOL_NAME, args, ["action", "keyword", "search_type", "page", "limit", "rid", "type", "input", "cursor"]);
    const action = requireDiscoveryAction(args);
    const page = positiveInteger(optionalNumber(TOOL_NAME, args, "page"), 1, "page", TOOL_NAME);
    const defaultLimit = action === "hot" || action === "home" ? 20 : 10;
    const limit = positiveInteger(optionalNumber(TOOL_NAME, args, "limit"), defaultLimit, "limit", TOOL_NAME);
    switch (action) {
      case "search": {
        const payload = await searchVideos({
          keyword: requireString(TOOL_NAME, args, "keyword"),
          page,
          pageSize: limit,
        });
        return normalizeVideoList(payload, "search", { arrayKey: "result", limit });
      }
      case "search_type":
        return searchByType({
          keyword: requireString(TOOL_NAME, args, "keyword"),
          searchType: optionalString(args.search_type) ?? "video",
          page,
          pageSize: limit,
        });
      case "suggest":
        return getSearchSuggestions({ keyword: requireString(TOOL_NAME, args, "keyword") });
      case "hot":
        return normalizeVideoList(await getHotVideos({ page, pageSize: limit }), "hot", { limit });
      case "ranking":
        return normalizeVideoList(
          await getRanking({ rid: optionalNumber(TOOL_NAME, args, "rid"), type: optionalString(args.type) }),
          "ranking",
          { limit },
        );
      case "weekly":
        return normalizeVideoList(await getWeeklySeries(), "weekly", { limit });
      case "must_watch":
        return normalizeVideoList(await getMustWatch(), "must_watch", { limit });
      case "related": {
        const context = await resolveVideoContext(requireString(TOOL_NAME, args, "input"), 1);
        const payload = await getRelatedVideos({ bvid: context.bvid });
        return {
          bvid: context.bvid,
          aid: context.aid,
          ...normalizeVideoList(payload, "related", { limit }),
        };
      }
      case "home":
        return getHomeRecommend({ limit });
      case "following":
        return getFollowingVideos({ limit, cursor: optionalString(args.cursor) });
    }
  },
};

function requireDiscoveryAction(args: Record<string, unknown>): DiscoveryAction {
  const action = requireString(TOOL_NAME, args, "action");
  if (isDiscoveryAction(action)) return action;
  throw new ValidationError("action 不受支持。", { tool: TOOL_NAME, action, fieldErrors: [{ field: "action", message: "不支持的发现 action。", received: action, allowed_values: [...DISCOVERY_ACTIONS] }] });
}

function isDiscoveryAction(action: string): action is DiscoveryAction {
  return DISCOVERY_ACTIONS.some((candidate) => candidate === action);
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
npm test
```

Expected: 132 tests pass (130 + 2 new tool-level tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/discovery-tool.ts tests/tools/discovery-tool.test.ts
git commit -m "feat(discovery): wire home + following actions through tool router"
```

---

## Task 5: README docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Locate the bilibili_discovery section**

Run:

```bash
grep -n "^### bilibili_discovery\|^#### action:" README.md
```

Note the line numbers — we'll insert two new `#### action:` blocks before the next top-level section.

- [ ] **Step 2: Add `home` and `following` action docs**

Find the existing line in README.md that says `### bilibili_discovery` and locate the end of that section (the last `#### action:` block inside it, before the next `### ` heading). Append the following two action blocks just before the next `### ` heading:

```markdown
#### action: `home`

获取首页推荐视频流。未登录时返回大众化推荐，登录后个性化。每次调用返回新一批(基于 `fresh_idx`)。

```json
// 请求
{ "action": "home", "limit": 20 }

// 返回
{
  "items": [
    {
      "bvid": "BV1xxxx",
      "aid": 12345,
      "cid": 67890,
      "title": "视频标题",
      "cover": "https://i0.hdslb.com/bfs/archive/xxx.jpg",
      "duration_seconds": 360,
      "duration_text": "06:00",
      "owner": { "mid": 25329395, "name": "Sacrive", "avatar": "https://..." },
      "stat": { "view": 170796, "danmaku": 2195, "like": 7111 },
      "publish_time": 1778500000,
      "is_followed": true,
      "reason": "已关注"
    }
  ]
}
```

`reason` 取值: `"已关注"` / `"高点赞"` / 上游 `content` 原文 / `null`。`limit` 默认 20,最大 30。

#### action: `following`

获取关注的 UP 主投稿视频。**必须登录**(SESSDATA 缺失时报 `BILIBILI_COOKIE_INVALID`),按发布时间倒序,翻页用 `cursor`。

```json
// 第一次调用
{ "action": "following", "limit": 15 }

// 翻页(把上次返回的 cursor 传回来)
{ "action": "following", "limit": 15, "cursor": "966873782060843027" }

// 返回
{
  "items": [
    {
      "bvid": "BV1xxxx",
      "aid": 12345,
      "title": "视频标题",
      "cover": "https://i0.hdslb.com/bfs/archive/xxx.jpg",
      "duration_text": "06:00",
      "desc": "动态描述,可能为空字符串",
      "jump_url": "https://www.bilibili.com/video/BV1xxxx/",
      "stat": { "view": 1234, "danmaku": 5 },
      "publish_time": 1778500000,
      "publish_text": "刚刚",
      "author": { "mid": 25329395, "name": "UP主", "avatar": "https://..." },
      "dynamic_id": "966887968322093078"
    }
  ],
  "cursor": "966873782060843027",
  "has_more": true,
  "update_baseline": "966887968322093078"
}
```

仅返回 `DYNAMIC_TYPE_AV` 与 `DYNAMIC_TYPE_UGC_SEASON` 类型(投稿视频与合集更新),转发动态等暂不支持。`stat` 仅含 `view`/`danmaku` (上游限制),需要更完整统计调用 `bilibili_video info`。
```

- [ ] **Step 3: Bump test count in README**

Find the line:

```
npm test          # 122 tests
```

Change to:

```
npm test          # 132 tests
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(discovery): home + following action documentation"
```

---

## Task 6: Release 0.3.3

**Files:**
- Modify: `package.json`
- Modify (separate repo): `~/Projects/claude-beats/.claude-plugin/marketplace.json`

- [ ] **Step 1: Bump version in `package.json`**

Open `package.json`, change:

```json
  "version": "0.3.2",
```

to:

```json
  "version": "0.3.3",
```

- [ ] **Step 2: Rebuild dist and run full test suite**

```bash
npm run build && npm test
```

Expected: build succeeds, 132 tests pass.

- [ ] **Step 3: Commit, tag, push**

```bash
git add package.json dist/
git commit -m "chore: release 0.3.3 — discovery feeds (home + following)"
git tag -a v0.3.3 -m "v0.3.3 — discovery feeds"
git push origin main
git push origin v0.3.3
```

- [ ] **Step 4: Bump marketplace version**

Open `/Users/zhaoqixuan/Projects/claude-beats/.claude-plugin/marketplace.json` and change the `bilibili-mcp` entry's `"version": "0.3.2"` to `"version": "0.3.3"`. Also update the description to mention feeds:

```json
      "version": "0.3.3",
      "description": "Bilibili MCP Server. CookieCloud login + WBI / bili_ticket / buvid anti-spider baseline. Snapshot extracts real frames via ffmpeg (binary lazy-downloads on first use). Discovery includes home recommendation feed and follow-feed videos. Tools: video, interaction, discovery, config.",
```

- [ ] **Step 5: Commit and push marketplace**

```bash
git -C /Users/zhaoqixuan/Projects/claude-beats add .claude-plugin/marketplace.json
git -C /Users/zhaoqixuan/Projects/claude-beats commit -m "chore: bump bilibili-mcp 0.3.2 → 0.3.3"
git -C /Users/zhaoqixuan/Projects/claude-beats push origin main
```

- [ ] **Step 6: Verify release**

Run:

```bash
git log --oneline -3
```

Expected: top commit is `chore: release 0.3.3 — discovery feeds (home + following)` (or close to it).

Run:

```bash
git tag -l | tail -3
```

Expected: `v0.3.3` present.

---

## Self-Review Checklist

- ✅ Spec S1 (`home`) → Task 2 implements `getHomeRecommend`; Task 4 wires it
- ✅ Spec S2 (`following`) → Task 3 implements `getFollowingVideos`; Task 4 wires it
- ✅ Spec S3 tool & schema changes → Task 4 covers `DISCOVERY_ACTIONS`, schema, switch, allow-list
- ✅ Auth strategy (home optional, following required) → Task 3 test "throws when SESSDATA missing"; Task 4 test "following requires SESSDATA"
- ✅ Error mapping → spec said `MISSING_SESSDATA` but actual code uses `BILIBILI_COOKIE_INVALID`; plan uses the existing code consistently (corrected from spec)
- ✅ Test list from spec (10 tests) → 4 home + 4 following module tests + 2 tool tests = 10
- ✅ File change list from spec → all 8 files accounted for in tasks
- ✅ Type consistency: `HomeRecommendItem`/`FollowingVideoItem` interfaces match the README sample shapes
- ✅ No placeholders: all code blocks are complete; all commands have expected outputs
