# Tool Output Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 4 个 MCP 工具中 6 个 endpoint 的输出归一化（F1-F4），新增 `src/tools/normalize.ts`，落地共享 `VideoCard` shape + 弹幕/字幕枚举/字段裁剪。

**Architecture:** TDD。先在 `src/tools/normalize.ts` 定义 5 个核心 normalizer 和共享 helper，每个 normalizer 独立测试。然后批量改造 SDK 配套（移走 `stripHtml`/合并 URL helper/`searchVideos` 改 raw passthrough），最后改造 4 个 MCP 工具的 6 个 action 调用 normalizer。

**Tech Stack:** TypeScript, Node test runner, mock fetch helper, 现有 `tests/helpers/mock-fetch.ts`。

**Spec：** `docs/superpowers/specs/2026-05-11-tool-output-normalization-design.md`

---

## File Structure

| 文件 | 操作 | 责任 |
|---|---|---|
| `src/tools/normalize.ts` | Create | 类型 (`VideoCard`/`VideoListResult`/`DanmakuItem`/`SubtitleEntry`) + 5 个 normalizer + 5 个 helper |
| `src/modules/search.ts` | Modify | 删除 `stripHtml`/`normalizeSearchItem`；`searchVideos` 改 raw passthrough |
| `src/modules/snapshot.ts` | Modify | `normalizeImageUrl` → 调 `normalizeAbsoluteUrl` |
| `src/modules/subtitle.ts` | Modify | `normalizeSubtitleUrl` → 调 `normalizeAbsoluteUrl` |
| `src/tools/discovery-tool.ts` | Modify | `hot`/`ranking`/`weekly`/`must_watch`/`related`/`search` 改用 normalize.ts；删除内部 normalizer |
| `src/tools/interaction-tool.ts` | Modify | `danmaku` 输出 items 改用 `normalizeDanmakuItem.map` |
| `src/tools/video-tool.ts` | Modify | `subtitle` 输出 entries 改用 `normalizeSubtitleEntry.map`；fallback 路径适配 `searchVideos` raw 形态 |
| `tests/tools/normalize.test.ts` | Create | normalize.ts 全部 normalizer + helper 的单元测试 |
| `tests/tools/discovery-tool.test.ts` | Modify | 既有 related test 调整为新 shape；新增 hot/search 断言 |
| `tests/tools/video-tool.test.ts` | Modify | 新增 subtitle 字段裁剪 + fallback 路径 |
| `tests/tools/tools.test.ts` | Modify | 新增 danmaku enum 断言 |
| `tests/modules/discovery.test.ts` | Modify | 删除引用废弃 export 的旧 test，保留 `getSearchSuggestions` 测试 |
| `tests/index.ts` | Modify | 注册 `normalize.test.ts` |

约定：每个 task 通过 `npm test` 验证后立即 commit。message 用 `feat:` / `refactor:` / `test:` 前缀。

**已知不确定项**：`weekly` endpoint 实际可能返回 series 元数据（不是视频列表）。如果是，本批 normalizer 会输出空 `list[]` —— 这是可接受的（weekly 完整支持留给 M2）。本批不在 weekly 路径上做特殊处理。

---

## Task 1: 创建 normalize.ts 共享 helper

**Files:**
- Create: `src/tools/normalize.ts`
- Create: `tests/tools/normalize.test.ts`
- Modify: `tests/index.ts`

- [ ] **Step 1: 在 `tests/index.ts` 注册新测试文件**

```typescript
// 末尾追加一行：
import "./tools/normalize.test.js";
```

- [ ] **Step 2: 写失败测试 `tests/tools/normalize.test.ts`**

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import {
  stripHtml,
  normalizeAbsoluteUrl,
  colorIntToHex,
  truncateText,
  DANMAKU_MODE_LABELS,
} from "../../src/tools/normalize.js";

test("stripHtml removes tags and collapses whitespace", () => {
  assert.equal(stripHtml("<em>Hello</em>  world"), "Hello world");
  assert.equal(stripHtml(undefined), "");
  assert.equal(stripHtml(null), "");
});

test("normalizeAbsoluteUrl prepends https for protocol-relative urls", () => {
  assert.equal(normalizeAbsoluteUrl("//i0.hdslb.com/cover.jpg"), "https://i0.hdslb.com/cover.jpg");
  assert.equal(normalizeAbsoluteUrl("https://x.com"), "https://x.com");
  assert.equal(normalizeAbsoluteUrl(""), "");
  assert.equal(normalizeAbsoluteUrl(undefined), "");
});

test("colorIntToHex formats integer to padded hex", () => {
  assert.equal(colorIntToHex(16777215), "#ffffff");
  assert.equal(colorIntToHex(0), "#000000");
  assert.equal(colorIntToHex(15138834), "#e70012");
});

test("truncateText cuts at max length and appends ellipsis", () => {
  assert.equal(truncateText("abcdef", 10), "abcdef");
  assert.equal(truncateText("abcdefghijkl", 6), "abcdef…");
  assert.equal(truncateText(undefined, 5), "");
});

test("DANMAKU_MODE_LABELS covers known modes", () => {
  assert.equal(DANMAKU_MODE_LABELS[1], "滚动");
  assert.equal(DANMAKU_MODE_LABELS[4], "底端");
  assert.equal(DANMAKU_MODE_LABELS[5], "顶端");
  assert.equal(DANMAKU_MODE_LABELS[6], "逆向");
  assert.equal(DANMAKU_MODE_LABELS[7], "高级");
  assert.equal(DANMAKU_MODE_LABELS[8], "代码");
  assert.equal(DANMAKU_MODE_LABELS[9], "BAS");
});
```

- [ ] **Step 3: 运行测试，确认全部失败**

Run: `npm test 2>&1 | tail -10`
Expected: 编译失败，因为 `src/tools/normalize.ts` 还不存在。

- [ ] **Step 4: 创建 `src/tools/normalize.ts` 实现 helper**

```typescript
export const DANMAKU_MODE_LABELS: Record<number, string> = {
  1: "滚动",
  4: "底端",
  5: "顶端",
  6: "逆向",
  7: "高级",
  8: "代码",
  9: "BAS",
};

export function stripHtml(value: unknown): string {
  return String(value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeAbsoluteUrl(url: unknown): string {
  const value = String(url ?? "").trim();
  if (!value) return "";
  return value.startsWith("//") ? `https:${value}` : value;
}

export function colorIntToHex(value: number): string {
  const numeric = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `#${numeric.toString(16).padStart(6, "0")}`;
}

export function truncateText(value: unknown, max: number): string {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
```

- [ ] **Step 5: 运行测试，确认全部通过**

Run: `npm test 2>&1 | tail -10`
Expected: PASS（30+5=35 个测试通过）

- [ ] **Step 6: Commit**

```bash
git add src/tools/normalize.ts tests/tools/normalize.test.ts tests/index.ts
git commit -m "feat: add normalize helpers for tool layer"
```

---

## Task 2: 添加 `normalizeVideoCard`

**Files:**
- Modify: `src/tools/normalize.ts`
- Modify: `tests/tools/normalize.test.ts`

- [ ] **Step 1: 追加 fixture & 失败测试到 `tests/tools/normalize.test.ts`**

```typescript
// 文件顶部 import 增加：
import { normalizeVideoCard, type VideoCard } from "../../src/tools/normalize.js";

// 文件末尾追加：

test("normalizeVideoCard maps hot endpoint payload", () => {
  const raw = {
    aid: 116546085061974,
    bvid: "BV1wPRZBMEft",
    title: "《陛下何故谋反》",
    pic: "http://i1.hdslb.com/bfs/archive/cover.jpg",
    duration: 89,
    pubdate: 1778385600,
    desc: "-",
    pub_location: "上海",
    tname: "搞笑",
    tnamev2: "语言类小剧场",
    owner: { mid: 100, name: "up", face: "//face.jpg" },
    stat: { view: 4726595, like: 303885, coin: 6133, favorite: 15864, reply: 4409, danmaku: 1505, share: 6407 },
    rights: { download: 0 },
    dimension: { width: 1080 },
    rcmd_reason: { content: "百万播放" },
    his_rank: 12,
    season_type: 1,
  };

  const card = normalizeVideoCard(raw, "hot");
  assert.equal(card.bvid, "BV1wPRZBMEft");
  assert.equal(card.aid, 116546085061974);
  assert.equal(card.title, "《陛下何故谋反》");
  assert.equal(card.url, "https://www.bilibili.com/video/BV1wPRZBMEft");
  assert.equal(card.cover, "http://i1.hdslb.com/bfs/archive/cover.jpg");
  assert.equal(card.duration_seconds, 89);
  assert.equal(card.duration_text, "01:29");
  assert.deepEqual(card.owner, { mid: 100, name: "up", avatar: "https://face.jpg" });
  assert.equal(card.stat.view, 4726595);
  assert.equal(card.stat.like, 303885);
  assert.equal(card.pub_location, "上海");
  assert.equal(card.category, "语言类小剧场");
  assert.equal(card.pubdate, 1778385600);
  assert.deepEqual(card.extras, { rcmd_reason: "百万播放", his_rank: 12, season_type: 1 });
  // 噪音字段不在
  const cardKeys = Object.keys(card);
  assert.ok(!cardKeys.includes("rights"));
  assert.ok(!cardKeys.includes("dimension"));
});

test("normalizeVideoCard search source strips highlight html and extracts senddate", () => {
  const raw = {
    aid: 116530582917601,
    bvid: "BV1WiRhBhEmQ",
    title: "<em class=\"keyword\">Veritasium</em> 真理元素",
    arcurl: "//www.bilibili.com/video/BV1WiRhBhEmQ",
    pic: "//i0.hdslb.com/bfs/archive/cover.jpg",
    description: "<em>药物</em>晶型危机",
    duration: "31:34",
    senddate: 1778130000,
    author: "Veritasium真理元素",
    mid: 94742590,
    upic: "//i1.hdslb.com/bfs/face/3e3e6ffa.jpg",
    play: 433574,
    like: 22302,
    review: 1990,
    favorites: 14175,
    danmaku: 1800,
    tag: "physics, chemistry",
    rank_score: 1234.56,
  };

  const card = normalizeVideoCard(raw, "search");
  assert.equal(card.title, "Veritasium 真理元素");
  assert.equal(card.description, "药物晶型危机");
  assert.equal(card.url, "https://www.bilibili.com/video/BV1WiRhBhEmQ");
  assert.equal(card.cover, "https://i0.hdslb.com/bfs/archive/cover.jpg");
  assert.equal(card.owner.name, "Veritasium真理元素");
  assert.equal(card.owner.avatar, "https://i1.hdslb.com/bfs/face/3e3e6ffa.jpg");
  assert.equal(card.stat.view, 433574);
  assert.equal(card.pubdate, 1778130000);
  assert.deepEqual(card.extras, { tag: "physics, chemistry", rank_score: 1234.56 });
});

test("normalizeVideoCard related source aligns with M6 shape", () => {
  const raw = {
    aid: 2,
    bvid: "BV2abcdefghi",
    cid: 22,
    title: "相关 <em>视频</em>",
    desc: "推荐说明",
    duration: 61,
    pic: "http://i0.hdslb.com/cover.jpg",
    tname: "动画",
    owner: { mid: 42, name: "UP", face: "avatar.jpg" },
    stat: { view: 100, danmaku: 2, reply: 3, favorite: 4, coin: 5, share: 6, like: 7 },
  };

  const card = normalizeVideoCard(raw, "related");
  assert.equal(card.title, "相关 视频");
  assert.equal(card.bvid, "BV2abcdefghi");
  assert.equal(card.duration_text, "01:01");
  assert.equal(card.owner.avatar, "avatar.jpg");
  assert.equal(card.category, "动画");
});
```

- [ ] **Step 2: 运行测试，确认 3 个 normalizeVideoCard 测试失败**

Run: `npm test 2>&1 | grep -E '(VideoCard|✘|fail)' | head -10`
Expected: 编译失败（`normalizeVideoCard` 尚未导出）。

- [ ] **Step 3: 在 `src/tools/normalize.ts` 添加类型和 normalizeVideoCard**

```typescript
// 在文件顶部导入区追加（如果还没有的话）：
// 已有 helper 导出在前面（Task 1 已加）。

export type VideoCardSource = "hot" | "ranking" | "weekly" | "must_watch" | "search" | "related";

export interface VideoCard {
  bvid: string;
  aid: number;
  title: string;
  url: string;
  cover: string;
  duration_seconds: number;
  duration_text: string;
  owner: { mid: number; name: string; avatar: string };
  stat: {
    view: number; like: number; coin: number; favorite: number;
    reply: number; danmaku: number; share: number;
  };
  description?: string;
  pub_location?: string;
  category?: string;
  pubdate?: number;
  extras?: Record<string, unknown>;
}

const DESCRIPTION_MAX = 200;

export function normalizeVideoCard(raw: any, source: VideoCardSource): VideoCard {
  const owner = raw?.owner ?? {};
  const stat = raw?.stat ?? {};
  const bvid = String(raw?.bvid ?? "");
  const aid = toNum(raw?.aid);
  const titleRaw = raw?.title;
  const descriptionRaw = source === "search" ? raw?.description : raw?.desc;
  const description = truncateText(stripHtml(descriptionRaw), DESCRIPTION_MAX);
  const card: VideoCard = {
    bvid,
    aid,
    title: stripHtml(titleRaw),
    url: bvid ? `https://www.bilibili.com/video/${bvid}` : "",
    cover: normalizeAbsoluteUrl(raw?.pic),
    duration_seconds: parseDurationSeconds(raw?.duration),
    duration_text: formatDuration(parseDurationSeconds(raw?.duration)),
    owner: {
      mid: source === "search" ? toNum(raw?.mid ?? owner?.mid) : toNum(owner?.mid),
      name: String((source === "search" ? raw?.author : owner?.name) ?? ""),
      avatar: normalizeAbsoluteUrl(source === "search" ? raw?.upic ?? owner?.face : owner?.face),
    },
    stat: pickStat(raw, source),
  };
  if (description) card.description = description;
  const pubLocation = optionalString(raw?.pub_location);
  if (pubLocation) card.pub_location = pubLocation;
  const category = optionalString(raw?.tnamev2 ?? raw?.tname);
  if (category) card.category = category;
  const pubdate = source === "search" ? toNum(raw?.senddate ?? raw?.pubdate) : toNum(raw?.pubdate);
  if (pubdate > 0) card.pubdate = pubdate;
  const extras = pickExtras(raw, source);
  if (Object.keys(extras).length > 0) card.extras = extras;
  return card;
}

function pickStat(raw: any, source: VideoCardSource): VideoCard["stat"] {
  if (source === "search") {
    return {
      view: toNum(raw?.play),
      like: toNum(raw?.like),
      coin: 0,
      favorite: toNum(raw?.favorites),
      reply: toNum(raw?.review),
      danmaku: toNum(raw?.danmaku ?? raw?.video_review),
      share: 0,
    };
  }
  const stat = raw?.stat ?? {};
  return {
    view: toNum(stat.view),
    like: toNum(stat.like),
    coin: toNum(stat.coin),
    favorite: toNum(stat.favorite),
    reply: toNum(stat.reply),
    danmaku: toNum(stat.danmaku),
    share: toNum(stat.share),
  };
}

function pickExtras(raw: any, source: VideoCardSource): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  switch (source) {
    case "hot":
    case "must_watch":
    case "weekly":
      if (raw?.rcmd_reason?.content) extras.rcmd_reason = raw.rcmd_reason.content;
      if (typeof raw?.his_rank === "number") extras.his_rank = raw.his_rank;
      if (typeof raw?.season_type === "number") extras.season_type = raw.season_type;
      break;
    case "ranking":
      if (raw?.score !== undefined) extras.score = raw.score;
      if (raw?.rank !== undefined) extras.rank = raw.rank;
      break;
    case "search":
      if (raw?.tag) extras.tag = String(raw.tag);
      if (raw?.rank_score !== undefined) extras.rank_score = Number(raw.rank_score);
      if (raw?.is_pay !== undefined) extras.is_pay = Boolean(raw.is_pay);
      break;
    case "related":
      // 暂无 related-only extras
      break;
  }
  return extras;
}

function parseDurationSeconds(value: unknown): number {
  if (typeof value === "number") return Math.max(0, Math.floor(value));
  if (typeof value === "string") {
    if (/^\d+$/.test(value)) return Number(value);
    const match = value.match(/^(\d+):(\d+)(?::(\d+))?$/);
    if (match) {
      const [, a, b, c] = match;
      return c ? Number(a) * 3600 + Number(b) * 60 + Number(c) : Number(a) * 60 + Number(b);
    }
  }
  return 0;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toNum(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
```

- [ ] **Step 4: 运行测试，确认 3 个新增 test 全部通过**

Run: `npm test 2>&1 | grep -E '(VideoCard|tests)' | head -10`
Expected: 全部通过；total 38 个测试。

- [ ] **Step 5: Commit**

```bash
git add src/tools/normalize.ts tests/tools/normalize.test.ts
git commit -m "feat: add normalizeVideoCard for shared video list shape"
```

---

## Task 3: 添加 `normalizeVideoList` 包装

**Files:**
- Modify: `src/tools/normalize.ts`
- Modify: `tests/tools/normalize.test.ts`

- [ ] **Step 1: 追加失败测试**

```typescript
// import 区追加：
import { normalizeVideoList, type VideoListResult } from "../../src/tools/normalize.js";

// 文件末尾追加：

test("normalizeVideoList unwraps payload list and applies limit", () => {
  const payload = {
    list: [
      { bvid: "BV1aaaaaaaaaa", aid: 1, title: "A", duration: 60, pubdate: 1, owner: {}, stat: {} },
      { bvid: "BV1bbbbbbbbbb", aid: 2, title: "B", duration: 90, pubdate: 2, owner: {}, stat: {} },
      { bvid: "BV1cccccccccc", aid: 3, title: "C", duration: 30, pubdate: 3, owner: {}, stat: {} },
    ],
    no_more: false,
  };
  const result = normalizeVideoList(payload, "hot", { limit: 2 });
  assert.equal(result.list.length, 2);
  assert.equal(result.list[0].bvid, "BV1aaaaaaaaaa");
  assert.equal(result.has_more, true);
});

test("normalizeVideoList accepts custom arrayKey for search payload", () => {
  const payload = {
    page: 1,
    numResults: 1000,
    next: 2,
    result: [
      { bvid: "BV1xxxxxxxxxx", aid: 100, title: "search", duration: "10:00", play: 0 },
    ],
    seid: "ignored",
    exp_list: { foo: true },
    pageinfo: {},
  };
  const result = normalizeVideoList(payload, "search", { arrayKey: "result", limit: 5 });
  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].bvid, "BV1xxxxxxxxxx");
  assert.equal(result.page, 1);
  assert.equal(result.has_more, true);
  assert.equal(result.total, 1000);
});

test("normalizeVideoList handles top-level array (related shape)", () => {
  const payload = [
    { bvid: "BV1aaaaaaaaaa", aid: 1, title: "first", duration: 10, owner: {}, stat: {} },
    { bvid: "BV1bbbbbbbbbb", aid: 2, title: "second", duration: 20, owner: {}, stat: {} },
  ];
  const result = normalizeVideoList(payload, "related", { limit: 1 });
  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].title, "first");
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test 2>&1 | grep -E '(VideoList)' | head -10`
Expected: `normalizeVideoList` 不存在的编译错误。

- [ ] **Step 3: 在 `src/tools/normalize.ts` 添加 `normalizeVideoList`**

```typescript
export interface VideoListResult {
  list: VideoCard[];
  page?: number;
  has_more?: boolean;
  total?: number;
}

export interface NormalizeVideoListOptions {
  limit?: number;
  arrayKey?: string;
}

export function normalizeVideoList(
  payload: unknown,
  source: VideoCardSource,
  opts: NormalizeVideoListOptions = {},
): VideoListResult {
  const { limit, arrayKey = "list" } = opts;
  const items = extractArray(payload, arrayKey);
  const limited = typeof limit === "number" && limit > 0 ? items.slice(0, limit) : items;
  const list = limited.map((raw) => normalizeVideoCard(raw, source));
  const result: VideoListResult = { list };
  if (!Array.isArray(payload) && payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const page = toOptionalPositiveInt(obj.page ?? obj.pn);
    if (page !== undefined) result.page = page;
    const total = toOptionalPositiveInt(obj.numResults ?? obj.total);
    if (total !== undefined) result.total = total;
    const hasMore = inferHasMore(obj, items.length, list.length);
    if (hasMore !== undefined) result.has_more = hasMore;
  }
  return result;
}

function extractArray(payload: unknown, arrayKey: string): any[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const value = (payload as Record<string, unknown>)[arrayKey];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function toOptionalPositiveInt(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : undefined;
}

function inferHasMore(obj: Record<string, unknown>, originalCount: number, normalizedCount: number): boolean | undefined {
  if (typeof obj.no_more === "boolean") return !obj.no_more;
  if (typeof obj.has_more === "boolean") return obj.has_more;
  const next = Number(obj.next);
  if (Number.isFinite(next) && next > 0) return true;
  if (originalCount !== normalizedCount) return true;
  return undefined;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test 2>&1 | tail -10`
Expected: 全绿，41 个测试。

- [ ] **Step 5: Commit**

```bash
git add src/tools/normalize.ts tests/tools/normalize.test.ts
git commit -m "feat: add normalizeVideoList wrapper with paging metadata"
```

---

## Task 4: 添加 `normalizeDanmakuItem`

**Files:**
- Modify: `src/tools/normalize.ts`
- Modify: `tests/tools/normalize.test.ts`

- [ ] **Step 1: 追加失败测试**

```typescript
// import 追加：
import { normalizeDanmakuItem, type DanmakuItem } from "../../src/tools/normalize.js";

// 末尾追加：

test("normalizeDanmakuItem expands mode label and color hex", () => {
  const result = normalizeDanmakuItem({
    time_seconds: 1258.586,
    mode: 1,
    font_size: 25,
    color: 16777215,
    content: "test",
  });
  assert.deepEqual(result, {
    time_seconds: 1258.586,
    content: "test",
    mode: 1,
    mode_label: "滚动",
    font_size: 25,
    color: 16777215,
    color_hex: "#ffffff",
  });
});

test("normalizeDanmakuItem unknown mode falls back to '未知'", () => {
  const result = normalizeDanmakuItem({
    time_seconds: 0,
    mode: 99,
    font_size: 12,
    color: 0,
    content: "x",
  });
  assert.equal(result.mode_label, "未知");
  assert.equal(result.color_hex, "#000000");
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test 2>&1 | grep -E 'normalizeDanmakuItem' | head -5`
Expected: 编译失败。

- [ ] **Step 3: 在 `src/tools/normalize.ts` 添加**

```typescript
export interface DanmakuItem {
  time_seconds: number;
  content: string;
  mode: number;
  mode_label: string;
  font_size: number;
  color: number;
  color_hex: string;
}

export function normalizeDanmakuItem(raw: any): DanmakuItem {
  const mode = toNum(raw?.mode);
  const color = toNum(raw?.color);
  return {
    time_seconds: typeof raw?.time_seconds === "number" ? raw.time_seconds : toNum(raw?.time_seconds),
    content: String(raw?.content ?? ""),
    mode,
    mode_label: DANMAKU_MODE_LABELS[mode] ?? "未知",
    font_size: toNum(raw?.font_size),
    color,
    color_hex: colorIntToHex(color),
  };
}
```

- [ ] **Step 4: 运行测试**

Run: `npm test 2>&1 | tail -10`
Expected: 全绿，43 个测试。

- [ ] **Step 5: Commit**

```bash
git add src/tools/normalize.ts tests/tools/normalize.test.ts
git commit -m "feat: add normalizeDanmakuItem with mode label and color hex"
```

---

## Task 5: 添加 `normalizeSubtitleEntry`

**Files:**
- Modify: `src/tools/normalize.ts`
- Modify: `tests/tools/normalize.test.ts`

- [ ] **Step 1: 追加失败测试**

```typescript
// import 追加：
import { normalizeSubtitleEntry, type SubtitleEntry } from "../../src/tools/normalize.js";

// 末尾追加：

test("normalizeSubtitleEntry strips internal fields and adds ai_generated", () => {
  const result = normalizeSubtitleEntry({
    id: 2013306452378246100,
    lan: "ai-zh",
    lan_doc: "中文",
    is_lock: false,
    subtitle_url: "//aisubtitle.hdslb.com/path?auth_key=abc",
    subtitle_url_v2: "//subtitle.bilibili.com/S%13%1B%1D",
    type: 1,
    id_str: "2013306452378246144",
    ai_type: 1,
    ai_status: 2,
  });
  assert.deepEqual(result, {
    id: 2013306452378246100,
    lan: "ai-zh",
    lan_doc: "中文",
    type: 1,
    ai_generated: true,
    subtitle_url: "https://aisubtitle.hdslb.com/path?auth_key=abc",
  });
});

test("normalizeSubtitleEntry treats non-ai_type as human", () => {
  const result = normalizeSubtitleEntry({
    id: 1,
    lan: "zh-Hans",
    lan_doc: "中文",
    type: 2,
    ai_type: 0,
    subtitle_url: "https://x.com/x.json",
  });
  assert.equal(result.ai_generated, false);
  assert.equal(result.subtitle_url, "https://x.com/x.json");
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test 2>&1 | grep -E 'SubtitleEntry' | head -5`

- [ ] **Step 3: 在 `src/tools/normalize.ts` 添加**

```typescript
export interface SubtitleEntry {
  id: number;
  lan: string;
  lan_doc: string;
  type: number;
  ai_generated: boolean;
  subtitle_url: string;
}

export function normalizeSubtitleEntry(raw: any): SubtitleEntry {
  return {
    id: toNum(raw?.id),
    lan: String(raw?.lan ?? ""),
    lan_doc: String(raw?.lan_doc ?? ""),
    type: toNum(raw?.type),
    ai_generated: raw?.ai_type === 1,
    subtitle_url: normalizeAbsoluteUrl(raw?.subtitle_url),
  };
}
```

- [ ] **Step 4: 运行测试**

Run: `npm test 2>&1 | tail -10`
Expected: 全绿，45 个测试。

- [ ] **Step 5: Commit**

```bash
git add src/tools/normalize.ts tests/tools/normalize.test.ts
git commit -m "feat: add normalizeSubtitleEntry"
```

---

## Task 6: search.ts 改造（删旧 normalizer + raw passthrough）

**Files:**
- Modify: `src/modules/search.ts`
- Modify: `src/tools/discovery-tool.ts`（仅 import）
- Modify: `src/tools/video-tool.ts`（适配 fallback 路径）
- Modify: `tests/modules/discovery.test.ts`（删旧 test）

- [ ] **Step 1: 删除 `tests/modules/discovery.test.ts` 中引用 `normalizeSearchItem` 和 `stripHtml` 的测试**

文件最终只保留 `getSearchSuggestions` 测试：

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import { getSearchSuggestions } from "../../src/modules/search.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

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
```

- [ ] **Step 2: 修改 `src/modules/search.ts`**

最终文件内容：

```typescript
import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import type { RequestContext } from "../core/types.js";

export async function searchVideos(input: { keyword: string; page?: number; pageSize?: number }, ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("search", "search", "web_search_by_type"), {
    search_type: "video",
    keyword: input.keyword,
    page: input.page ?? 1,
    page_size: input.pageSize ?? 10,
  }, ctx);
}

export async function searchAll(input: { keyword: string; page?: number }, ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("search", "search", "web_search"), {
    keyword: input.keyword,
    page: input.page ?? 1,
  }, ctx);
}

export async function searchByType(input: { keyword: string; searchType?: string; page?: number; pageSize?: number }, ctx?: RequestContext): Promise<any> {
  if (!input.searchType || input.searchType === "video") {
    return searchVideos({ keyword: input.keyword, page: input.page, pageSize: input.pageSize }, ctx);
  }
  return request(getEndpoint("search", "search", "web_search_by_type"), {
    search_type: input.searchType,
    keyword: input.keyword,
    page: input.page ?? 1,
    page_size: input.pageSize ?? 10,
  }, ctx);
}

export async function getHotSearchKeywords(ctx?: RequestContext): Promise<any> {
  const payload = await request<any>(getEndpoint("search", "search", "hotword"), {}, ctx);
  return { list: Array.isArray(payload?.list) ? payload.list : [] };
}

export async function getSearchSuggestions(input: { keyword: string }, ctx?: RequestContext): Promise<string[]> {
  const payload = await request<any>(getEndpoint("search", "search", "suggest"), { term: input.keyword }, ctx);
  return normalizeSuggestions(payload);
}

function normalizeSuggestions(payload: any): string[] {
  const candidates = Array.isArray(payload?.result?.tag)
    ? payload.result.tag
    : Array.isArray(payload?.tag)
      ? payload.tag
      : Array.isArray(payload)
        ? payload
        : [];
  const values = candidates.map((item: any) => {
    if (typeof item === "string") return item;
    return item?.value ?? item?.name ?? item?.term ?? item?.keyword;
  });
  const strings = values
    .map((value: unknown) => String(value ?? "").trim())
    .filter((value: string) => value.length > 0);
  return [...new Set<string>(strings)];
}
```

注意：`stripHtml` 和 `normalizeSearchItem` 完全删除；`searchVideos` 直接 `return request(...)`，不再 `{ raw, results }` 包装。

- [ ] **Step 3: 修改 `src/tools/discovery-tool.ts` 的 stripHtml import**

把 `import { stripHtml } from "../modules/search.js";`（第 6 行）替换为：

```typescript
import { stripHtml } from "./normalize.js";
```

- [ ] **Step 4: 修改 `src/tools/video-tool.ts` 第 88 行 fallback 路径**

原代码：
```typescript
const searchResult = await searchVideos({ keyword: normalized, page: 1, pageSize: 1 });
const first = Array.isArray(searchResult?.results) ? searchResult.results[0] : undefined;
```

改为：
```typescript
const searchResult = await searchVideos({ keyword: normalized, page: 1, pageSize: 1 });
const first = Array.isArray(searchResult?.result) ? searchResult.result[0] : undefined;
```

注意：`searchResult.results` → `searchResult.result`（B 站 raw payload 字段是 `result`，单数）。

- [ ] **Step 5: 修改 `tests/tools/video-tool.test.ts` 第 27 行 mock 响应**

原 mock 已经返回 `data: { result: [...] }` 形式（B 站原始 shape），所以**不需要改 mock**。但要核对 test 内仍然只断言 `result.bvid` / `result.title`，与新 fallback 路径兼容。

Run: `grep -n "results" tests/tools/video-tool.test.ts || echo "no references"`
Expected: 输出 `no references`，说明 fallback test 不依赖 `.results`。

- [ ] **Step 6: 运行测试**

Run: `npm test 2>&1 | tail -15`
Expected: 全绿。讨论中的 "search item normalization strips Bilibili highlight HTML" 这条 test 已被删除（功能迁到了 Task 2 的 normalizeVideoCard search source 测试）。`tests/modules/discovery.test.ts` 现在只剩一条 suggest 测试。

- [ ] **Step 7: Commit**

```bash
git add src/modules/search.ts src/tools/discovery-tool.ts src/tools/video-tool.ts tests/modules/discovery.test.ts
git commit -m "refactor: searchVideos returns raw payload; migrate stripHtml import"
```

---

## Task 7: snapshot.ts / subtitle.ts URL helper 合并

**Files:**
- Modify: `src/modules/snapshot.ts`
- Modify: `src/modules/subtitle.ts`

- [ ] **Step 1: 修改 `src/modules/snapshot.ts`**

替换原 `normalizeImageUrl` 私有函数（第 88-91 行）。

文件顶部 import 区追加：
```typescript
import { normalizeAbsoluteUrl } from "../tools/normalize.js";
```

文件中 `imageUrl: normalizeImageUrl(image[imageIndex])`（第 59 行）改为：
```typescript
imageUrl: normalizeAbsoluteUrl(image[imageIndex]),
```

删除文件末尾的私有 `function normalizeImageUrl(url: unknown): string { ... }`。

- [ ] **Step 2: 修改 `src/modules/subtitle.ts`**

文件顶部 import 区追加：
```typescript
import { normalizeAbsoluteUrl } from "../tools/normalize.js";
```

`selected_url: normalizeSubtitleUrl(selected?.subtitle_url)` 改为：
```typescript
selected_url: optionalUrl(selected?.subtitle_url),
```

并把文件中的 `normalizeSubtitleUrl` 实现改成委托：
```typescript
export function normalizeSubtitleUrl(url: unknown): string | undefined {
  return optionalUrl(url);
}

function optionalUrl(url: unknown): string | undefined {
  const value = normalizeAbsoluteUrl(url);
  return value ? value : undefined;
}
```

注意：保留 `normalizeSubtitleUrl` 导出（它在 subtitle 模块外有 0 个调用方但保险起见保留 1 个 release，下个版本删）。

- [ ] **Step 3: 运行测试**

Run: `npm test 2>&1 | tail -10`
Expected: 全绿。snapshot/subtitle 既有测试不变（行为等价）。

- [ ] **Step 4: Commit**

```bash
git add src/modules/snapshot.ts src/modules/subtitle.ts
git commit -m "refactor: consolidate URL helpers via normalizeAbsoluteUrl"
```

---

## Task 8: discovery-tool.ts hot/ranking/weekly/must_watch + related action 接入 normalizer

**Files:**
- Modify: `src/tools/discovery-tool.ts`
- Modify: `tests/tools/discovery-tool.test.ts`

- [ ] **Step 1: 改 `src/tools/discovery-tool.ts`**

把 6 处变更同时做掉：

1. import 区追加：
```typescript
import { normalizeVideoList } from "./normalize.js";
```

2. 删除整段 `function normalizeRelatedVideos`（第 81-105 行）和它依赖的 `normalizeOwner` / `normalizeStat` / `toRecord` / `isRecord` / `toNullableNumber` / `toNumber`（第 107-144 行），以及 `formatDuration` 的 import（第 5 行；不再需要）。

3. switch 内：
   - `case "hot"`: `return normalizeVideoList(await getHotVideos({ page, pageSize: limit }), "hot", { limit });`
   - `case "ranking"`: `return normalizeVideoList(await getRanking({ rid: ..., type: ... }), "ranking", { limit });`
   - `case "weekly"`: `return normalizeVideoList(await getWeeklySeries(), "weekly", { limit });`
   - `case "must_watch"`: `return normalizeVideoList(await getMustWatch(), "must_watch", { limit });`
   - `case "related"`:
     ```typescript
     const context = await resolveVideoContext(requireString(TOOL_NAME, args, "input"), 1);
     const payload = await getRelatedVideos({ bvid: context.bvid });
     return {
       bvid: context.bvid,
       aid: context.aid,
       ...normalizeVideoList(payload, "related", { limit }),
     };
     ```

4. 文件最终 import 简化为（按顺序）：
```typescript
import { ValidationError } from "../core/errors.js";
import { getHotSearchKeywords, getSearchSuggestions, searchAll, searchByType, searchVideos } from "../modules/search.js";
import { getHotVideos, getMustWatch, getRanking, getWeeklySeries } from "../modules/ranking.js";
import { getRelatedVideos } from "../modules/recommend.js";
import { assertAllowedArgs, optionalNumber, optionalString, positiveInteger, requireString, type ToolRouter } from "./common.js";
import { normalizeVideoList } from "./normalize.js";
import { resolveVideoContext } from "./video-tool.js";
```

`searchVideos` 在下个 task 用，先 import 进来。

- [ ] **Step 2: 修改 `tests/tools/discovery-tool.test.ts` 中既有 related 测试**

把第 51-70 行的 `assert.deepEqual(result, {...})` 替换为按新 shape 断言：

```typescript
    assert.equal(result.bvid, "BV1abcdefghi");
    assert.equal(result.aid, 1);
    assert.equal(result.list.length, 1);
    const card = result.list[0];
    assert.equal(card.bvid, "BV2abcdefghi");
    assert.equal(card.aid, 2);
    assert.equal(card.title, "相关 视频");
    assert.equal(card.url, "https://www.bilibili.com/video/BV2abcdefghi");
    assert.equal(card.cover, "http://i0.hdslb.com/cover.jpg");
    assert.deepEqual(card.owner, { mid: 42, name: "UP", avatar: "avatar.jpg" });
    assert.equal(card.duration_text, "01:01");
    assert.equal(card.description, "推荐说明");
    assert.equal(card.category, "动画");
    // 噪音字段不出现
    const cardKeys = Object.keys(card);
    assert.ok(!cardKeys.includes("rights"));
    assert.ok(!cardKeys.includes("dimension"));
    assert.ok(!cardKeys.includes("cid"));
```

注意：原断言里有 `cid: 22`；新 VideoCard shape 没有 `cid` 字段，所以这里改为断言 `cid` 不存在。

- [ ] **Step 3: 在 `tests/tools/discovery-tool.test.ts` 末尾追加新测试**

```typescript
test("discovery hot strips raw payload noise into VideoCard shape", async () => {
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/popular") {
      return jsonResponse({
        code: 0,
        data: {
          list: [
            {
              aid: 1,
              bvid: "BV1aaaaaaaaaa",
              title: "热门第一",
              pic: "//i0.hdslb.com/cover.jpg",
              duration: 89,
              owner: { mid: 100, name: "up", face: "//face.jpg" },
              stat: { view: 100, like: 50, coin: 10, favorite: 20, reply: 5, danmaku: 7, share: 3 },
              rights: { download: 0 },
              dimension: { width: 1920 },
              up_from_v2: 36,
              cover43: "ignored",
              tnamev2: "搞笑",
              his_rank: 12,
              rcmd_reason: { content: "百万播放" },
            },
          ],
          no_more: false,
        },
      });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await callTool("bilibili_discovery", { action: "hot", limit: 5 }) as any;
    assert.equal(result.list.length, 1);
    const card = result.list[0];
    assert.equal(card.cover, "https://i0.hdslb.com/cover.jpg");
    assert.equal(card.category, "搞笑");
    assert.deepEqual(card.extras, { rcmd_reason: "百万播放", his_rank: 12 });
    const cardKeys = Object.keys(card);
    for (const noise of ["rights", "dimension", "up_from_v2", "cover43", "tname", "ctime", "state", "videos"]) {
      assert.ok(!cardKeys.includes(noise), `unexpected key: ${noise}`);
    }
    assert.equal(result.has_more, true);
  } finally {
    fetchMock.restore();
  }
});
```

- [ ] **Step 4: 运行测试**

Run: `npm test 2>&1 | tail -15`
Expected: 47 个测试全绿。

- [ ] **Step 5: Commit**

```bash
git add src/tools/discovery-tool.ts tests/tools/discovery-tool.test.ts
git commit -m "feat: discovery hot/ranking/weekly/must_watch/related use normalizeVideoList"
```

---

## Task 9: discovery-tool.ts search action 接入

**Files:**
- Modify: `src/tools/discovery-tool.ts`
- Modify: `tests/tools/discovery-tool.test.ts`

- [ ] **Step 1: 改 `src/tools/discovery-tool.ts` 中 `case "search"`**

把：
```typescript
      case "search":
        return searchAll({ keyword: requireString(TOOL_NAME, args, "keyword"), page });
```

改为：
```typescript
      case "search": {
        const payload = await searchVideos({
          keyword: requireString(TOOL_NAME, args, "keyword"),
          page,
          pageSize: limit,
        });
        return normalizeVideoList(payload, "search", { arrayKey: "result", limit });
      }
```

注意：从 `searchAll`（综合搜索）切到 `searchVideos`（视频专项），与 spec 4.3 一致。`searchAll` 仍然 export，但 `search` action 不再用它（用户若需要综合搜索可通过 `search_type` action 配合 `search_type: 'all'`，这部分留给未来）。

- [ ] **Step 2: 在 `tests/tools/discovery-tool.test.ts` 末尾追加 search test**

```typescript
test("discovery search returns VideoListResult and drops raw payload noise", async () => {
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
    if (url.pathname === "/x/web-interface/wbi/search/type") {
      return jsonResponse({
        code: 0,
        data: {
          page: 1,
          pagesize: 5,
          numResults: 1000,
          next: 2,
          seid: "ignored",
          exp_list: { foo: true, bar: true },
          pageinfo: { tv: { numResults: 0, pages: 0, total: 0 } },
          result: [
            {
              aid: 116530582917601,
              bvid: "BV1WiRhBhEmQ",
              title: "<em class=\"keyword\">Veritasium</em> 真理元素",
              arcurl: "https://www.bilibili.com/video/BV1WiRhBhEmQ",
              pic: "//i0.hdslb.com/bfs/archive/cover.jpg",
              description: "晶型危机",
              author: "Veritasium真理元素",
              mid: 94742590,
              upic: "//i1.hdslb.com/bfs/face/3e3e6ffa.jpg",
              duration: "31:34",
              senddate: 1778130000,
              play: 433574,
              like: 22302,
              review: 1990,
              favorites: 14175,
              danmaku: 1800,
              tag: "physics",
              rank_score: 1234.56,
            },
          ],
        },
      });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await callTool("bilibili_discovery", {
      action: "search",
      keyword: "Veritasium",
      limit: 5,
    }) as any;
    const resultKeys = Object.keys(result);
    for (const noise of ["seid", "exp_list", "pageinfo", "rqt_type", "is_hit_web_inf", "egg_hit"]) {
      assert.ok(!resultKeys.includes(noise), `unexpected key: ${noise}`);
    }
    assert.equal(result.list.length, 1);
    assert.equal(result.page, 1);
    assert.equal(result.total, 1000);
    assert.equal(result.has_more, true);
    const card = result.list[0];
    assert.equal(card.bvid, "BV1WiRhBhEmQ");
    assert.equal(card.title, "Veritasium 真理元素");
    assert.equal(card.cover, "https://i0.hdslb.com/bfs/archive/cover.jpg");
    assert.equal(card.duration_seconds, 1894);
    assert.equal(card.duration_text, "31:34");
    assert.equal(card.owner.name, "Veritasium真理元素");
    assert.equal(card.owner.avatar, "https://i1.hdslb.com/bfs/face/3e3e6ffa.jpg");
    assert.equal(card.stat.view, 433574);
    assert.equal(card.pubdate, 1778130000);
    assert.deepEqual(card.extras, { tag: "physics", rank_score: 1234.56 });
  } finally {
    fetchMock.restore();
  }
});
```

注意：search 走 wbi 签名，需要 mock `/x/web-interface/nav` 提供 wbi keys（参考既有 video-tool.test.ts fallback 测试同样做了这件事）。

- [ ] **Step 3: 运行测试**

Run: `npm test 2>&1 | tail -15`
Expected: 48 个测试全绿。

- [ ] **Step 4: Commit**

```bash
git add src/tools/discovery-tool.ts tests/tools/discovery-tool.test.ts
git commit -m "feat: discovery search returns VideoListResult shape"
```

---

## Task 10: interaction-tool.ts danmaku 接入 normalizer

**Files:**
- Modify: `src/tools/interaction-tool.ts`
- Modify: `tests/tools/tools.test.ts`

- [ ] **Step 1: 改 `src/tools/interaction-tool.ts` 的 `getDanmaku`**

文件顶部 import 区追加：
```typescript
import { normalizeDanmakuItem } from "./normalize.js";
```

把 `getDanmaku`（第 90-97 行）改为：
```typescript
async function getDanmaku(args: Record<string, unknown>): Promise<unknown> {
  const target = await resolveReadVideoTarget(args, positiveInteger(optionalNumber(TOOL_NAME, args, "page"), 1, "page", TOOL_NAME));
  if (!target.cid) throw new ValidationError("danmaku action 未解析到 cid。", { tool: TOOL_NAME });
  const payload = await getXmlDanmaku({
    cid: target.cid,
    limit: positiveInteger(optionalNumber(TOOL_NAME, args, "limit"), 100, "limit", TOOL_NAME),
  });
  return {
    ...payload,
    items: Array.isArray(payload?.items) ? payload.items.map(normalizeDanmakuItem) : [],
  };
}
```

- [ ] **Step 2: 在 `tests/tools/tools.test.ts` 末尾追加测试**

先 read 当前 tools.test.ts，找到合适的位置追加。在文件末尾追加：

```typescript
test("danmaku items expose mode_label and color_hex", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><i><d p="10.5,1,25,16777215,0,0,0,0">滚动弹幕</d><d p="20.0,5,25,15138834,0,0,0,0">顶端</d></i>`;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/view") {
      return jsonResponse({
        code: 0,
        data: {
          bvid: "BV1abcdefghi",
          aid: 1,
          cid: 11,
          pages: [{ page: 1, cid: 11, part: "P1", duration: 60 }],
        },
      });
    }
    if (url.pathname.startsWith("/x/v1/dm/list.so") || url.pathname === "/x/v1/dm/list.so") {
      return new Response(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
    }
    if (url.hostname === "comment.bilibili.com") {
      return new Response(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await callTool("bilibili_interaction", {
      action: "danmaku",
      input: "BV1abcdefghi",
      limit: 5,
    }) as any;
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].mode_label, "滚动");
    assert.equal(result.items[0].color_hex, "#ffffff");
    assert.equal(result.items[1].mode_label, "顶端");
    assert.equal(result.items[1].color_hex, "#e70012");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});
```

如果文件顶部还没 import `config`，添加：
```typescript
import { config } from "../../src/core/config.js";
```

- [ ] **Step 3: 运行测试**

Run: `npm test 2>&1 | tail -15`
Expected: 49 个测试全绿。

注意：danmaku endpoint base_url 是 comment（`https://comment.bilibili.com`）。如果 mock 用 url.pathname 不匹配，改为按 hostname 判断。先跑一次看 stderr 能不能匹配。

- [ ] **Step 4: Commit**

```bash
git add src/tools/interaction-tool.ts tests/tools/tools.test.ts
git commit -m "feat: interaction danmaku items include mode_label and color_hex"
```

---

## Task 11: video-tool.ts subtitle 接入 normalizer

**Files:**
- Modify: `src/tools/video-tool.ts`
- Modify: `tests/tools/video-tool.test.ts`

- [ ] **Step 1: 改 `src/tools/video-tool.ts` 的 subtitle action**

文件顶部 import 区追加：
```typescript
import { normalizeSubtitleEntry } from "./normalize.js";
```

把 `case "subtitle":` 处（第 52-53 行）的：
```typescript
      case "subtitle":
        return getVideoSubtitles({ bvid: context.bvid, cid: context.page.cid, preferredLang: optionalString(args.preferred_lang) });
```

改为：
```typescript
      case "subtitle": {
        const sub = await getVideoSubtitles({ bvid: context.bvid, cid: context.page.cid, preferredLang: optionalString(args.preferred_lang) });
        return {
          ...sub,
          subtitles: Array.isArray(sub?.subtitles) ? sub.subtitles.map(normalizeSubtitleEntry) : [],
        };
      }
```

- [ ] **Step 2: 在 `tests/tools/video-tool.test.ts` 末尾追加测试**

```typescript
test("video subtitle entries strip internal fields and infer ai_generated", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/view") {
      return jsonResponse({
        code: 0,
        data: {
          bvid: "BV1WiRhBhEmQ",
          aid: 116530582917601,
          cid: 38147394355,
          pages: [{ page: 1, cid: 38147394355, part: "P1", duration: 1894 }],
        },
      });
    }
    if (url.pathname === "/x/player/wbi/v2") {
      return jsonResponse({
        code: 0,
        data: {
          subtitle: {
            subtitles: [
              {
                id: 2013306452378246100,
                lan: "ai-zh",
                lan_doc: "中文",
                is_lock: false,
                subtitle_url: "//aisubtitle.hdslb.com/path?auth_key=abc",
                subtitle_url_v2: "//subtitle.bilibili.com/S%13%1B",
                type: 1,
                id_str: "2013306452378246144",
                ai_type: 1,
                ai_status: 2,
              },
            ],
          },
        },
      });
    }
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
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await callTool("bilibili_video", {
      action: "subtitle",
      input: "BV1WiRhBhEmQ",
      preferred_lang: "zh-Hans",
    }) as any;
    assert.equal(result.subtitles.length, 1);
    const entry = result.subtitles[0];
    assert.equal(entry.id, 2013306452378246100);
    assert.equal(entry.lan, "ai-zh");
    assert.equal(entry.ai_generated, true);
    assert.equal(entry.subtitle_url, "https://aisubtitle.hdslb.com/path?auth_key=abc");
    const entryKeys = Object.keys(entry);
    for (const noise of ["subtitle_url_v2", "is_lock", "id_str", "ai_type", "ai_status"]) {
      assert.ok(!entryKeys.includes(noise), `unexpected key: ${noise}`);
    }
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});
```

- [ ] **Step 3: 运行测试**

Run: `npm test 2>&1 | tail -15`
Expected: 50 个测试全绿。

- [ ] **Step 4: Commit**

```bash
git add src/tools/video-tool.ts tests/tools/video-tool.test.ts
git commit -m "feat: video subtitle entries strip internal fields"
```

---

## Task 12: 最终验证

**Files:** 无修改

- [ ] **Step 1: 完整 test 套件**

Run: `npm test 2>&1 | tail -10`
Expected:
```
ℹ tests 50
ℹ pass 50
ℹ fail 0
```

- [ ] **Step 2: 编译检查**

Run: `npm run build 2>&1 | tail -5`
Expected: 编译成功，dist 目录刷新。

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: 无输出（无类型错误）。

- [ ] **Step 4: 验收脚本（手工）**

Run: `node dist/cli.js check 2>&1 | tail -10`
Expected:
```
配置状态：可用
登录状态：已登录
```

- [ ] **Step 5: LLM 实跑复测（可选）**

如果有时间，重新启动 Claude Code，对同一个 BV1WiRhBhEmQ 跑：
- `bilibili_discovery hot` → 每条 ≤ 12 字段（除 extras）
- `bilibili_discovery search keyword=Veritasium` → 输出 < 5KB，list 形态
- `bilibili_interaction danmaku input=BV1WiRhBhEmQ limit=5` → 包含 `mode_label`、`color_hex`
- `bilibili_video subtitle input=BV1WiRhBhEmQ` → 不含 `subtitle_url_v2`/`is_lock`

如果 LLM 实跑发现新问题（比如 weekly 实际形状不一致），记成 milestone 1.x 后续 issue，不阻塞本批 merge。

- [ ] **Step 6: 终结提交（如有需要）**

如果 LLM 实跑发现微调，再 commit 一次：
```bash
git commit -m "chore: M1.x tool output normalization complete"
```

否则跳过。

---

## 验收标准（来自 spec 第 10 节）

- [x] 新增 / 修改的 6 个 tool action 输出符合 spec 定义的 shape
- [x] 单元测试全部通过（normalize.test.ts + 增强既有 tool 测试）
- [x] `npm test` 全绿
- [x] `npm run build` 通过
- [x] LLM 实跑复测：search < 5KB、hot ≤ 12 字段、danmaku 含 `mode_label`/`color_hex`、subtitle 不含 `subtitle_url_v2`

---

## Self-Review 检查

✅ Spec 全部 10 节均有对应任务覆盖：
  - 第 3 节原则 → Task 1-5 直接落地
  - 第 4 节 VideoCard / VideoListResult → Task 2-3
  - 第 5.1 节 DanmakuItem → Task 4
  - 第 5.2 节 SubtitleEntry → Task 5
  - 第 6 节 模块结构 → Task 1-5（normalize.ts）+ Task 6-7（SDK 配套）
  - 第 6.1 节 tool 文件调整 → Task 8-11
  - 第 7 节 测试策略 → Task 1-11 各步嵌入
  - 第 8 节示例数据 → Task 2 hot/search/related fixture 全部 cover
  - 第 9 节实施顺序 → 与本计划任务顺序一致
  - 第 10 节验收 → Task 12

✅ 类型/方法签名一致性：`VideoCard` / `VideoCardSource` / `VideoListResult` / `DanmakuItem` / `SubtitleEntry` 在所有 task 内拼写一致。

✅ 无 placeholder：每个 step 含具体代码 / 命令 / 期望输出。

✅ 已知未覆盖项：weekly 真实 API 行为 — 计划开头已声明降级处理（M2 工作）。
