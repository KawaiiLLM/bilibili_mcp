# Stream & Snapshot Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `stream` action, upgrade `snapshot` to extract real frames via ffmpeg-static, surface available qualities in `info`.

**Architecture:** Three changes to `bilibili_video`. (1) Remove `stream` action; `getPlayUrl` becomes internal. (2) `info` calls `getPlayUrl` with `try_look=1` and appends `available_qualities` from `support_formats`. (3) `snapshot` with a `timestamp` resolves a stream URL, runs `ffmpeg -ss {ts} -i {url} -frames:v 1` from `ffmpeg-static`, and returns the temp file path; without `timestamp` it returns sprite sheet metadata (unchanged).

**Tech Stack:** TypeScript, Node ≥ 18 ESM, `node:test`, `ffmpeg-static@^5.3.0`, `child_process.execFile`, `os.tmpdir`.

**Spec:** `docs/superpowers/specs/2026-05-11-stream-snapshot-redesign.md`

---

## File Structure

| file | responsibility |
|---|---|
| `package.json` | declare `ffmpeg-static` runtime dependency |
| `src/data/api/video.json` | `get_playurl.auth: false` (playurl works without login) |
| `src/modules/quality.ts` (new) | `QN_DESCRIPTIONS` map + `describeQuality(qn)` + `getQualityRequirements(qn)` |
| `src/modules/video.ts` | extend `getPlayUrl()` with optional `tryLook`/`platform`/`fnval`/`fourk` |
| `src/modules/snapshot.ts` | add `selectVideoStream()`, `extractFrame()`; branch in `getVideoSnapshot()` on timestamp |
| `src/tools/video-tool.ts` | drop `stream` route; drop top-level `quality`; add `snapshot` `quality`; add `available_qualities` to info return |
| `README.md` | refresh tool docs |
| `tests/modules/quality.test.ts` (new) | unit-test the quality table + helpers |
| `tests/modules/snapshot.test.ts` | extend with `selectVideoStream` + `extractFrame` cases |
| `tests/modules/video.test.ts` | extend with `getPlayUrl` parameter forwarding |
| `tests/tools/video-tool.test.ts` | update info test, replace snapshot test, remove stream test |

---

## Task 1: Add ffmpeg-static dependency and relax playurl auth gate

**Files:**
- Modify: `/Users/zhaoqixuan/Projects/bilibili-mcp/package.json`
- Modify: `/Users/zhaoqixuan/Projects/bilibili-mcp/src/data/api/video.json`

- [ ] **Step 1: Add ffmpeg-static dependency**

Edit `package.json` `dependencies` block (alphabetical order, before `protobufjs`):

```json
"dependencies": {
  "@modelcontextprotocol/sdk": "^1.27.1",
  "commander": "^14.0.3",
  "dotenv": "^17.2.4",
  "express": "^5.2.1",
  "ffmpeg-static": "^5.3.0",
  "protobufjs": "^7.5.4",
  "quick-lru": "^7.3.0"
},
```

- [ ] **Step 2: Install**

Run: `cd /Users/zhaoqixuan/Projects/bilibili-mcp && npm install`
Expected: `package-lock.json` updates; `node_modules/ffmpeg-static/` exists with a binary at `node_modules/ffmpeg-static/ffmpeg`.

- [ ] **Step 3: Relax playurl auth in endpoint catalog**

Edit `src/data/api/video.json`. Locate the `get_playurl` block (around line 41-56) and change `"auth": true` to `"auth": false`:

```json
"get_playurl": {
  "url": "https://api.bilibili.com/x/player/wbi/playurl",
  "method": "GET",
  "wbi": true,
  "auth": false,
  "csrf": false,
  "buvid": true,
  "params_type": "query",
  "response_type": "json",
  "defaults": {
    "fnver": 0,
    "fnval": 16,
    "fourk": 1
  },
  "comment": "Get video stream URLs. Works without auth (lower qualities); SESSDATA unlocks higher qualities."
}
```

- [ ] **Step 4: Verify tests still pass**

Run: `npm test`
Expected: 105 tests pass, no regressions.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/data/api/video.json
git commit -m "deps: add ffmpeg-static; relax playurl auth gate"
```

---

## Task 2: Quality description module

**Files:**
- Create: `/Users/zhaoqixuan/Projects/bilibili-mcp/src/modules/quality.ts`
- Create: `/Users/zhaoqixuan/Projects/bilibili-mcp/tests/modules/quality.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/modules/quality.test.ts`:

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import { describeQuality, getQualityRequirements, QN_DESCRIPTIONS } from "../../src/modules/quality.js";

test("describeQuality returns mapped description for known qn", () => {
  assert.equal(describeQuality(80), "1080P 高清");
  assert.equal(describeQuality(64), "720P 高清");
  assert.equal(describeQuality(16), "360P 流畅");
  assert.equal(describeQuality(120), "4K 超清");
});

test("describeQuality returns null for unknown qn", () => {
  assert.equal(describeQuality(999), null);
  assert.equal(describeQuality(0), null);
});

test("getQualityRequirements classifies vip / login / open by qn", () => {
  assert.deepEqual(getQualityRequirements(120), { need_vip: true, need_login: true });
  assert.deepEqual(getQualityRequirements(112), { need_vip: true, need_login: true });
  assert.deepEqual(getQualityRequirements(80), { need_vip: false, need_login: true });
  assert.deepEqual(getQualityRequirements(64), { need_vip: false, need_login: true });
  assert.deepEqual(getQualityRequirements(32), { need_vip: false, need_login: false });
  assert.deepEqual(getQualityRequirements(16), { need_vip: false, need_login: false });
});

test("QN_DESCRIPTIONS contains all documented qn values", () => {
  for (const qn of [6, 16, 32, 64, 74, 80, 100, 112, 116, 120, 125, 126, 127]) {
    assert.ok(typeof QN_DESCRIPTIONS[qn] === "string", `qn ${qn} should be mapped`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A2 quality`
Expected: FAIL — cannot find module `quality.js`.

- [ ] **Step 3: Implement quality module**

Create `src/modules/quality.ts`:

```typescript
export const QN_DESCRIPTIONS: Record<number, string> = {
  6: "240P 极速",
  16: "360P 流畅",
  32: "480P 清晰",
  64: "720P 高清",
  74: "720P60 高帧率",
  80: "1080P 高清",
  100: "智能修复",
  112: "1080P+ 高码率",
  116: "1080P60 高帧率",
  120: "4K 超清",
  125: "HDR 真彩色",
  126: "杜比视界",
  127: "8K 超高清",
};

export function describeQuality(qn: number): string | null {
  return QN_DESCRIPTIONS[qn] ?? null;
}

export interface QualityRequirements {
  need_login: boolean;
  need_vip: boolean;
}

export function getQualityRequirements(qn: number): QualityRequirements {
  if (qn >= 112) return { need_login: true, need_vip: true };
  if (qn >= 64) return { need_login: true, need_vip: false };
  return { need_login: false, need_vip: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test 2>&1 | tail -5`
Expected: all tests pass including 4 new quality tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/quality.ts tests/modules/quality.test.ts
git commit -m "feat(quality): qn description table and login/vip classification"
```

---

## Task 3: Extend getPlayUrl with try_look / platform / fnval / fourk

**Files:**
- Modify: `/Users/zhaoqixuan/Projects/bilibili-mcp/src/modules/video.ts`
- Modify: `/Users/zhaoqixuan/Projects/bilibili-mcp/tests/modules/video.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/modules/video.test.ts`:

```typescript
import { getPlayUrl } from "../../src/modules/video.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";
import { config } from "../../src/core/config.js";

test("getPlayUrl forwards optional params (try_look, platform)", async () => {
  config.enableBiliTicket = false;
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  let capturedParams: URLSearchParams | undefined;
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
    if (url.pathname === "/x/player/wbi/playurl") {
      capturedParams = url.searchParams;
      return jsonResponse({ code: 0, data: { dash: { video: [], audio: [] } } });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    await getPlayUrl({ bvid: "BV1abcdefghi", cid: 11, qn: 80, tryLook: true, platform: "html5" });
    assert.ok(capturedParams, "playurl was not called");
    assert.equal(capturedParams!.get("bvid"), "BV1abcdefghi");
    assert.equal(capturedParams!.get("cid"), "11");
    assert.equal(capturedParams!.get("qn"), "80");
    assert.equal(capturedParams!.get("try_look"), "1");
    assert.equal(capturedParams!.get("platform"), "html5");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A2 "getPlayUrl forwards"`
Expected: FAIL — `tryLook` / `platform` not accepted, params not sent.

- [ ] **Step 3: Extend getPlayUrl**

Replace the `getPlayUrl` function in `src/modules/video.ts` (around line 27-33):

```typescript
export interface GetPlayUrlInput {
  bvid: string;
  cid: number;
  qn?: number;
  tryLook?: boolean;
  platform?: "pc" | "html5";
  fnval?: number;
  fourk?: number;
}

export async function getPlayUrl(input: GetPlayUrlInput, ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("video", "info", "get_playurl"), {
    bvid: input.bvid,
    cid: input.cid,
    qn: input.qn,
    try_look: input.tryLook ? 1 : undefined,
    platform: input.platform,
    fnval: input.fnval,
    fourk: input.fourk,
  }, ctx);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test 2>&1 | tail -5`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/video.ts tests/modules/video.test.ts
git commit -m "feat(video): getPlayUrl forwards try_look / platform / fnval / fourk"
```

---

## Task 4: Add available_qualities to info return

**Files:**
- Modify: `/Users/zhaoqixuan/Projects/bilibili-mcp/src/tools/video-tool.ts`
- Modify: `/Users/zhaoqixuan/Projects/bilibili-mcp/tests/tools/video-tool.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/tools/video-tool.test.ts`:

```typescript
test("video info return includes url and available_qualities from playurl support_formats", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/view") {
      return jsonResponse({
        code: 0,
        data: {
          bvid: "BV1abcdefghi",
          aid: 1,
          cid: 11,
          title: "test",
          pages: [{ page: 1, cid: 11, part: "P1", duration: 20 }],
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
    if (url.pathname === "/x/frontend/finger/spi") {
      return jsonResponse({ code: 0, data: { b_3: "buvid3", b_4: "buvid4" } });
    }
    if (url.pathname === "/x/player/wbi/playurl") {
      return jsonResponse({
        code: 0,
        data: {
          support_formats: [
            { quality: 120, new_description: "4K 超清", format: "hdflv2" },
            { quality: 80, new_description: "1080P 高清", format: "flv" },
            { quality: 64, new_description: "720P 高清", format: "flv720" },
            { quality: 32, new_description: "480P 清晰", format: "flv480" },
          ],
        },
      });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await callTool("bilibili_video", { action: "info", input: "BV1abcdefghi" }) as any;
    assert.equal(result.url, "https://www.bilibili.com/video/BV1abcdefghi");
    assert.ok(Array.isArray(result.available_qualities), "available_qualities should be an array");
    assert.deepEqual(result.available_qualities, [
      { qn: 120, desc: "4K 超清", need_login: true, need_vip: true },
      { qn: 80, desc: "1080P 高清", need_login: true, need_vip: false },
      { qn: 64, desc: "720P 高清", need_login: true, need_vip: false },
      { qn: 32, desc: "480P 清晰", need_login: false, need_vip: false },
    ]);
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("video info omits available_qualities silently when playurl fails", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/view") {
      return jsonResponse({
        code: 0,
        data: {
          bvid: "BV1abcdefghi",
          aid: 1,
          cid: 11,
          title: "test",
          pages: [{ page: 1, cid: 11, part: "P1", duration: 20 }],
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
    if (url.pathname === "/x/frontend/finger/spi") {
      return jsonResponse({ code: 0, data: { b_3: "buvid3", b_4: "buvid4" } });
    }
    if (url.pathname === "/x/player/wbi/playurl") {
      return jsonResponse({ code: -404, message: "playurl unavailable" });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await callTool("bilibili_video", { action: "info", input: "BV1abcdefghi" }) as any;
    assert.equal(result.url, "https://www.bilibili.com/video/BV1abcdefghi");
    assert.ok(!("available_qualities" in result), "available_qualities should be omitted on failure");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A2 "available_qualities"`
Expected: FAIL — `available_qualities` undefined in result.

- [ ] **Step 3: Add helper and wire into info handler**

In `src/tools/video-tool.ts`, add imports at the top:

```typescript
import { describeQuality, getQualityRequirements } from "../modules/quality.js";
```

Add a helper function near the bottom of the file (before the last `function isRecord` block):

```typescript
async function buildAvailableQualities(bvid: string, cid: number): Promise<Array<Record<string, unknown>> | undefined> {
  try {
    const payload = await getPlayUrl({ bvid, cid, tryLook: true });
    const formats = Array.isArray(payload?.support_formats) ? payload.support_formats : [];
    if (formats.length === 0) return undefined;
    return formats.map((sf: any) => {
      const qn = Number(sf?.quality);
      const desc = String(sf?.new_description ?? describeQuality(qn) ?? "").trim();
      const req = getQualityRequirements(qn);
      return { qn, desc, need_login: req.need_login, need_vip: req.need_vip };
    }).filter((entry: any) => Number.isFinite(entry.qn) && entry.qn > 0);
  } catch {
    return undefined;
  }
}
```

Modify the `case "info":` branch (around line 47-48) to:

```typescript
case "info": {
  const base = summarizeContext(context);
  const availableQualities = await buildAvailableQualities(context.bvid, context.page.cid);
  return availableQualities ? { ...base, available_qualities: availableQualities } : base;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test 2>&1 | tail -5`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/video-tool.ts tests/tools/video-tool.test.ts
git commit -m "feat(video): info exposes available_qualities from support_formats"
```

---

## Task 5: Remove stream action and top-level quality parameter

**Files:**
- Modify: `/Users/zhaoqixuan/Projects/bilibili-mcp/src/tools/video-tool.ts`
- Modify: `/Users/zhaoqixuan/Projects/bilibili-mcp/tests/tools/tools.test.ts` (if it tests action list)

- [ ] **Step 1: Check tools.test.ts for stream references**

Run: `grep -n stream /Users/zhaoqixuan/Projects/bilibili-mcp/tests/tools/tools.test.ts`
Expected: zero or few matches; if present, those assertions need updating.

- [ ] **Step 2: Update VIDEO_ACTIONS, schema, and switch**

In `src/tools/video-tool.ts`:

Replace line 12:
```typescript
const VIDEO_ACTIONS = ["info", "detail", "subtitle", "summary", "snapshot", "pages"] as const;
```

Replace lines 26 and 30 (description and enum):
```typescript
description: "B 站视频工具。通过 action 选择 info/detail/subtitle/summary/snapshot/pages。",
```
```typescript
action: { type: "string", enum: VIDEO_ACTIONS, description: "info/detail/subtitle/summary/snapshot/pages" },
```

Replace line 35 (drop top-level `quality`; keep `timestamp`):
```typescript
// remove the "quality" property entry entirely
```

Replace line 42 (drop `quality` from allowed args):
```typescript
assertAllowedArgs(TOOL_NAME, args, ["action", "input", "page", "preferred_lang", "timestamp"]);
```

Delete lines 69-70 (the `case "stream":` block).

- [ ] **Step 3: Run tests to verify behavior**

Run: `npm test 2>&1 | tail -10`
Expected: all tests pass (no stream test exists now since Task 4 replaced surrounding tests).

If any test asserts `stream` is a valid action and fails, delete that assertion.

- [ ] **Step 4: Commit**

```bash
git add src/tools/video-tool.ts
git commit -m "feat(video): remove stream action (getPlayUrl stays internal)"
```

---

## Task 6: Frame extraction module — pure functions and injectable runner

**Files:**
- Modify: `/Users/zhaoqixuan/Projects/bilibili-mcp/src/modules/snapshot.ts`
- Modify: `/Users/zhaoqixuan/Projects/bilibili-mcp/tests/modules/snapshot.test.ts`

- [ ] **Step 1: Write failing tests for selectVideoStream**

Append to `tests/modules/snapshot.test.ts`:

```typescript
import { selectVideoStream } from "../../src/modules/snapshot.js";

test("selectVideoStream picks DASH stream closest to target qn with AVC preference", () => {
  const payload = {
    dash: {
      video: [
        { id: 80, codecid: 12, baseUrl: "hev-1080.m4s", width: 1920, height: 1080 },
        { id: 80, codecid: 7, baseUrl: "avc-1080.m4s", width: 1920, height: 1080 },
        { id: 64, codecid: 7, baseUrl: "avc-720.m4s", width: 1280, height: 720 },
      ],
    },
  };
  const stream = selectVideoStream(payload, 80);
  assert.equal(stream.url, "avc-1080.m4s");
  assert.equal(stream.quality, 80);
  assert.equal(stream.width, 1920);
  assert.equal(stream.height, 1080);
});

test("selectVideoStream picks closest available when exact qn not present", () => {
  const payload = {
    dash: {
      video: [
        { id: 64, codecid: 7, baseUrl: "avc-720.m4s", width: 1280, height: 720 },
        { id: 32, codecid: 7, baseUrl: "avc-480.m4s", width: 854, height: 480 },
      ],
    },
  };
  const stream = selectVideoStream(payload, 80);
  assert.equal(stream.url, "avc-720.m4s");
  assert.equal(stream.quality, 64);
});

test("selectVideoStream falls back to durl when no DASH", () => {
  const payload = { durl: [{ url: "video.mp4" }], quality: 32 };
  const stream = selectVideoStream(payload, 80);
  assert.equal(stream.url, "video.mp4");
  assert.equal(stream.quality, 32);
});

test("selectVideoStream throws when no streams available", () => {
  assert.throws(() => selectVideoStream({ dash: { video: [] } }, 80), /NO_VIDEO_STREAM/);
  assert.throws(() => selectVideoStream({}, 80), /NO_VIDEO_STREAM/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A2 selectVideoStream`
Expected: FAIL — `selectVideoStream` is not exported.

- [ ] **Step 3: Implement selectVideoStream**

In `src/modules/snapshot.ts`, append (keep existing exports intact):

```typescript
import { describeQuality } from "./quality.js";

export interface SelectedStream {
  url: string;
  quality: number;
  width?: number;
  height?: number;
  codec?: string;
}

export function selectVideoStream(payload: any, targetQn: number): SelectedStream {
  const dashVideos: any[] = Array.isArray(payload?.dash?.video) ? payload.dash.video : [];
  if (dashVideos.length > 0) {
    const sorted = [...dashVideos].sort((a, b) => {
      const distA = Math.abs(Number(a?.id ?? 0) - targetQn);
      const distB = Math.abs(Number(b?.id ?? 0) - targetQn);
      if (distA !== distB) return distA - distB;
      const codecA = Number(a?.codecid ?? 0);
      const codecB = Number(b?.codecid ?? 0);
      if (codecA === 7 && codecB !== 7) return -1;
      if (codecB === 7 && codecA !== 7) return 1;
      return 0;
    });
    const chosen = sorted[0];
    return {
      url: String(chosen?.baseUrl ?? chosen?.base_url ?? ""),
      quality: Number(chosen?.id ?? 0),
      width: chosen?.width != null ? Number(chosen.width) : undefined,
      height: chosen?.height != null ? Number(chosen.height) : undefined,
      codec: chosen?.codecs ? String(chosen.codecs) : undefined,
    };
  }

  const durl: any[] = Array.isArray(payload?.durl) ? payload.durl : [];
  if (durl.length > 0 && durl[0]?.url) {
    return {
      url: String(durl[0].url),
      quality: Number(payload?.quality ?? 0),
    };
  }

  throw new Error("NO_VIDEO_STREAM");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test 2>&1 | tail -5`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/snapshot.ts tests/modules/snapshot.test.ts
git commit -m "feat(snapshot): selectVideoStream picks DASH/durl track closest to qn"
```

---

## Task 7: extractFrame with injectable ffmpeg runner

**Files:**
- Modify: `/Users/zhaoqixuan/Projects/bilibili-mcp/src/modules/snapshot.ts`
- Modify: `/Users/zhaoqixuan/Projects/bilibili-mcp/tests/modules/snapshot.test.ts`

- [ ] **Step 1: Write failing test for extractFrame orchestration**

Append to `tests/modules/snapshot.test.ts`:

```typescript
import { extractFrame } from "../../src/modules/snapshot.js";
import { installMockFetch as installFetchForFrame, jsonResponse as jsonFrame } from "../helpers/mock-fetch.js";
import { config as cfg } from "../../src/core/config.js";

test("extractFrame orchestrates getPlayUrl → selectVideoStream → ffmpeg runner", async () => {
  cfg.enableBiliTicket = false;
  const previousRateLimit = cfg.rateLimitMs;
  cfg.rateLimitMs = 0;
  const fetchMock = installFetchForFrame((url) => {
    if (url.pathname === "/x/web-interface/nav") {
      return jsonFrame({
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
      return jsonFrame({ code: 0, data: { b_3: "buvid3", b_4: "buvid4" } });
    }
    if (url.pathname === "/x/player/wbi/playurl") {
      return jsonFrame({
        code: 0,
        data: {
          dash: {
            video: [
              { id: 80, codecid: 7, baseUrl: "https://cdn.example/avc-1080.m4s", width: 1920, height: 1080 },
            ],
          },
        },
      });
    }
    return jsonFrame({ code: -404, message: `unexpected ${url.pathname}` });
  });

  const calls: any[] = [];
  const fakeRunner = async (args: { url: string; timestamp: number; outpath: string; headers?: Record<string, string> }) => {
    calls.push(args);
  };

  try {
    const result = await extractFrame({
      bvid: "BV1abcdefghi",
      cid: 11,
      timestamp: 30,
    }, { runner: fakeRunner });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://cdn.example/avc-1080.m4s");
    assert.equal(calls[0].timestamp, 30);
    assert.match(calls[0].outpath, /bilibili-snapshot-BV1abcdefghi.*\.jpg$/);
    assert.equal(result.timestamp, 30);
    assert.equal(result.width, 1920);
    assert.equal(result.height, 1080);
    assert.equal(result.quality, 80);
    assert.equal(result.quality_desc, "1080P 高清");
    assert.equal(result.file, calls[0].outpath);
  } finally {
    cfg.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("extractFrame uses try_look when no SESSDATA in context", async () => {
  cfg.enableBiliTicket = false;
  const previousRateLimit = cfg.rateLimitMs;
  cfg.rateLimitMs = 0;
  let capturedPlayurlParams: URLSearchParams | undefined;
  const fetchMock = installFetchForFrame((url) => {
    if (url.pathname === "/x/web-interface/nav") {
      return jsonFrame({
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
      return jsonFrame({ code: 0, data: { b_3: "buvid3", b_4: "buvid4" } });
    }
    if (url.pathname === "/x/player/wbi/playurl") {
      capturedPlayurlParams = url.searchParams;
      return jsonFrame({
        code: 0,
        data: {
          dash: { video: [{ id: 64, codecid: 7, baseUrl: "https://cdn.example/720.m4s", width: 1280, height: 720 }] },
        },
      });
    }
    return jsonFrame({ code: -404, message: `unexpected ${url.pathname}` });
  });

  const fakeRunner = async () => {};

  try {
    await extractFrame({ bvid: "BV1abcdefghi", cid: 11, timestamp: 5 }, { runner: fakeRunner });
    assert.ok(capturedPlayurlParams);
    assert.equal(capturedPlayurlParams!.get("try_look"), "1");
    assert.equal(capturedPlayurlParams!.get("platform"), "html5");
  } finally {
    cfg.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -A2 extractFrame`
Expected: FAIL — `extractFrame` not exported.

- [ ] **Step 3: Implement extractFrame**

Append to `src/modules/snapshot.ts`:

```typescript
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { credentialManager } from "../core/credential.js";
import type { Credential } from "../core/types.js";
import { config } from "../core/config.js";
import { BilibiliAPIError } from "../core/errors.js";
import { getPlayUrl } from "./video.js";

const execFileAsync = promisify(execFile);

export interface ExtractFrameInput {
  bvid: string;
  cid: number;
  timestamp: number;
  quality?: number;
  page?: number;
}

export interface ExtractFrameResult {
  file: string;
  timestamp: number;
  width?: number;
  height?: number;
  quality: number;
  quality_desc: string | null;
}

export interface FrameRunnerArgs {
  url: string;
  timestamp: number;
  outpath: string;
  headers?: Record<string, string>;
}

export type FrameRunner = (args: FrameRunnerArgs) => Promise<void>;

export interface ExtractFrameOptions {
  runner?: FrameRunner;
}

async function tryGetCredential(): Promise<Credential | undefined> {
  try {
    return await credentialManager.refreshCredentials(false);
  } catch (err) {
    if (err instanceof BilibiliAPIError && err.code === "COOKIECLOUD_CONFIG_INVALID") return undefined;
    if (err instanceof Error && /CookieCloud/.test(err.message)) return undefined;
    return undefined;
  }
}

export async function extractFrame(input: ExtractFrameInput, options: ExtractFrameOptions = {}): Promise<ExtractFrameResult> {
  const credential = await tryGetCredential();
  const hasAuth = Boolean(credential?.cookieHeader && /SESSDATA=/.test(credential.cookieHeader));
  const targetQn = input.quality ?? 80;

  const playurl = await getPlayUrl({
    bvid: input.bvid,
    cid: input.cid,
    qn: targetQn,
    tryLook: hasAuth ? undefined : true,
    platform: hasAuth ? undefined : "html5",
    fnval: 16,
    fourk: 1,
  }, hasAuth ? { credential } : undefined);

  const stream = selectVideoStream(playurl, targetQn);
  if (!stream.url) {
    throw new Error("SNAPSHOT_EXTRACT_FAILED: empty stream URL");
  }

  const page = Number.isFinite(input.page) && input.page! > 0 ? input.page : 1;
  const outpath = join(tmpdir(), `bilibili-snapshot-${input.bvid}-p${page}-${Math.floor(input.timestamp)}s.jpg`);

  const headers: Record<string, string> | undefined = hasAuth
    ? { Referer: "https://www.bilibili.com", "User-Agent": config.userAgent }
    : undefined;

  const runner = options.runner ?? defaultFrameRunner;
  await runner({ url: stream.url, timestamp: input.timestamp, outpath, headers });

  return {
    file: outpath,
    timestamp: input.timestamp,
    width: stream.width,
    height: stream.height,
    quality: stream.quality,
    quality_desc: describeQuality(stream.quality),
  };
}

async function defaultFrameRunner(args: FrameRunnerArgs): Promise<void> {
  const ffmpegPath = await loadFfmpegPath();
  const cmd: string[] = ["-y", "-ss", String(args.timestamp), "-i", args.url, "-frames:v", "1", "-q:v", "2", args.outpath];
  if (args.headers && Object.keys(args.headers).length > 0) {
    const header = Object.entries(args.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n";
    cmd.splice(0, 0, "-headers", header);
  }
  try {
    await execFileAsync(ffmpegPath, cmd, { timeout: 30_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SNAPSHOT_EXTRACT_FAILED: ${message}`);
  }
}

async function loadFfmpegPath(): Promise<string> {
  const mod: any = await import("ffmpeg-static");
  const path = mod?.default ?? mod;
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("SNAPSHOT_EXTRACT_FAILED: ffmpeg-static binary not available");
  }
  return path;
}
```

**Note on credential resolution:** the implementation above uses `tryGetCredential()`, which wraps `credentialManager.refreshCredentials(false)` and swallows `COOKIECLOUD_CONFIG_INVALID` (matching the pattern in `client.ts:resolveCredential`). When no CookieCloud is configured, this returns `undefined` so `extractFrame` falls back to `try_look=1 + platform=html5`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test 2>&1 | tail -10`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/snapshot.ts tests/modules/snapshot.test.ts
git commit -m "feat(snapshot): extractFrame uses getPlayUrl + ffmpeg-static (injectable runner)"
```

---

## Task 8: Wire extractFrame into snapshot tool action

**Files:**
- Modify: `/Users/zhaoqixuan/Projects/bilibili-mcp/src/modules/snapshot.ts`
- Modify: `/Users/zhaoqixuan/Projects/bilibili-mcp/src/tools/video-tool.ts`
- Modify: `/Users/zhaoqixuan/Projects/bilibili-mcp/tests/tools/video-tool.test.ts`

- [ ] **Step 1: Replace existing snapshot tool test**

Locate the existing test `"video snapshot action returns located frame for timestamp"` in `tests/tools/video-tool.test.ts` (around line 57-100) and replace it with two tests:

```typescript
test("video snapshot returns sprite metadata when no timestamp provided", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/view") {
      return jsonResponse({
        code: 0,
        data: {
          bvid: "BV1abcdefghi",
          aid: 1,
          cid: 11,
          pages: [{ page: 1, cid: 11, part: "P1", duration: 20 }],
        },
      });
    }
    if (url.pathname === "/x/player/videoshot") {
      return jsonResponse({
        code: 0,
        data: {
          image: ["//i0.hdslb.com/bfs/videoshot/1.jpg"],
          index: [0, 8, 14],
          img_x_len: 2,
          img_y_len: 2,
          img_x_size: 160,
          img_y_size: 90,
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
    if (url.pathname === "/x/frontend/finger/spi") {
      return jsonResponse({ code: 0, data: { b_3: "buvid3", b_4: "buvid4" } });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await callTool("bilibili_video", { action: "snapshot", input: "BV1abcdefghi" }) as any;
    assert.ok(Array.isArray(result.image));
    assert.ok(Array.isArray(result.index));
    assert.ok(!("file" in result), "no timestamp ⇒ no extracted file");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("video snapshot extracts frame when timestamp provided", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/view") {
      return jsonResponse({
        code: 0,
        data: {
          bvid: "BV1abcdefghi",
          aid: 1,
          cid: 11,
          pages: [{ page: 1, cid: 11, part: "P1", duration: 120 }],
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
    if (url.pathname === "/x/frontend/finger/spi") {
      return jsonResponse({ code: 0, data: { b_3: "buvid3", b_4: "buvid4" } });
    }
    if (url.pathname === "/x/player/wbi/playurl") {
      return jsonResponse({
        code: 0,
        data: {
          dash: { video: [{ id: 80, codecid: 7, baseUrl: "https://cdn.example/avc-1080.m4s", width: 1920, height: 1080 }] },
        },
      });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  const { setFrameRunnerForTest } = await import("../../src/modules/snapshot.js");
  const restore = setFrameRunnerForTest(async () => {});

  try {
    const result = await callTool("bilibili_video", {
      action: "snapshot",
      input: "BV1abcdefghi",
      timestamp: 60,
    }) as any;
    assert.equal(result.timestamp, 60);
    assert.equal(result.quality, 80);
    assert.equal(result.quality_desc, "1080P 高清");
    assert.equal(result.width, 1920);
    assert.equal(result.height, 1080);
    assert.match(result.file, /bilibili-snapshot-BV1abcdefghi-p1-60s\.jpg$/);
  } finally {
    restore();
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});
```

- [ ] **Step 2: Add test-injection hook to snapshot.ts**

In `src/modules/snapshot.ts`, replace the body of `defaultFrameRunner` selection logic. Introduce a module-level mutable runner with a test setter:

```typescript
let frameRunner: FrameRunner = defaultFrameRunner;

export function setFrameRunnerForTest(runner: FrameRunner): () => void {
  const previous = frameRunner;
  frameRunner = runner;
  return () => {
    frameRunner = previous;
  };
}
```

Change `extractFrame` to use the module-level runner when no runner is passed:

```typescript
const runner = options.runner ?? frameRunner;
```

- [ ] **Step 3: Update getVideoSnapshot to branch on timestamp**

Replace the body of `getVideoSnapshot` in `src/modules/snapshot.ts`:

```typescript
export async function getVideoSnapshot(input: {
  bvid: string;
  aid?: number;
  cid: number;
  timestamp?: number;
  quality?: number;
  page?: number;
}, ctx?: RequestContext): Promise<any> {
  if (input.timestamp === undefined) {
    return getSnapshotMeta({ bvid: input.bvid, aid: input.aid, cid: input.cid }, ctx);
  }
  return extractFrame({
    bvid: input.bvid,
    cid: input.cid,
    timestamp: input.timestamp,
    quality: input.quality,
    page: input.page,
  });
}
```

- [ ] **Step 4: Update tool schema and routing**

In `src/tools/video-tool.ts`:

Re-add a `quality` property to schema (under `snapshot` semantics, not `stream`):

```typescript
quality: { type: "number", description: "截图清晰度 qn (snapshot with timestamp 时使用)，默认 80 (1080P)" },
```

Update `assertAllowedArgs` to include `quality`:

```typescript
assertAllowedArgs(TOOL_NAME, args, ["action", "input", "page", "preferred_lang", "timestamp", "quality"]);
```

Update `case "snapshot":` to pass `page` and `quality`:

```typescript
case "snapshot":
  return getVideoSnapshot({
    bvid: context.bvid,
    aid: context.aid,
    cid: context.page.cid,
    timestamp: optionalNumber(TOOL_NAME, args, "timestamp"),
    quality: optionalNumber(TOOL_NAME, args, "quality"),
    page: context.page.page,
  });
```

- [ ] **Step 5: Run all tests**

Run: `npm test 2>&1 | tail -10`
Expected: all tests pass — old `frame.timestamp` test has been replaced by the new pair.

- [ ] **Step 6: Commit**

```bash
git add src/modules/snapshot.ts src/tools/video-tool.ts tests/tools/video-tool.test.ts
git commit -m "feat(snapshot): wire timestamp branch through tool; add test runner hook"
```

---

## Task 9: README refresh

**Files:**
- Modify: `/Users/zhaoqixuan/Projects/bilibili-mcp/README.md`

- [ ] **Step 1: Drop stream section from action enum row**

In `README.md`, find the `### bilibili_video` section. Update the parameter table to remove the `quality` row from the top-level table (since it's snapshot-only). Update the action list intro to drop `stream`.

Action enum row in tool intro:
```
视频信息、字幕、截图。
```

Parameter table (replace top-level table):
```markdown
| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `action` | string | 是 | 见下方 action 列表 |
| `input` | string | 是 | BV号/AV号/链接/关键词 |
| `page` | number | 否 | 分P序号,默认 1 |
| `preferred_lang` | string | 否 | 字幕语言偏好,如 `zh-Hans`、`en` |
| `timestamp` | number | 否 | snapshot 抽帧时间戳/秒 |
| `quality` | number | 否 | snapshot 抽帧清晰度 qn,默认 80 (1080P) |
```

- [ ] **Step 2: Update info action example**

Replace the existing info action example's return JSON to include `available_qualities`:

```json
// 返回 (新增 available_qualities)
{
  "title": "...",
  "bvid": "BV19v411r76g",
  "url": "https://www.bilibili.com/video/BV19v411r76g",
  "owner": { "mid": 25329395, "name": "Sacrive" },
  "stat": { "view": 170789, "like": 7111 },
  "duration_seconds": 9016,
  "pages": [/* ... */],
  "available_qualities": [
    { "qn": 120, "desc": "4K 超清", "need_login": true, "need_vip": true },
    { "qn": 80,  "desc": "1080P 高清", "need_login": true, "need_vip": false },
    { "qn": 64,  "desc": "720P 高清", "need_login": true, "need_vip": false },
    { "qn": 32,  "desc": "480P 清晰", "need_login": false, "need_vip": false }
  ]
}
```

- [ ] **Step 3: Rewrite snapshot action section**

Replace the existing snapshot section with:

```markdown
#### action: `snapshot`

两种模式，按 `timestamp` 是否指定区分:

**模式 A — 不传 timestamp**: 返回 B 站的雪碧图元数据 (用于进度条预览):

```json
// 请求
{ "action": "snapshot", "input": "BV19v411r76g", "page": 1 }

// 返回 (B 站原生 videoshot 响应)
{
  "image": ["https://i0.hdslb.com/bfs/videoshot/..."],
  "index": [0, 8, 14, 19, /* ... */],
  "img_x_len": 10,
  "img_y_len": 10,
  "img_x_size": 160,
  "img_y_size": 90
}
```

**模式 B — 传 timestamp**: 取视频流并用 ffmpeg 抽出指定时间的单帧,返回临时文件路径:

```json
// 请求
{ "action": "snapshot", "input": "BV19v411r76g", "page": 2, "timestamp": 60, "quality": 80 }

// 返回
{
  "file": "/tmp/bilibili-snapshot-BV19v411r76g-p2-60s.jpg",
  "timestamp": 60,
  "width": 1920,
  "height": 1080,
  "quality": 80,
  "quality_desc": "1080P 高清"
}
```

- 内置 `ffmpeg-static`，无需额外安装
- 有 SESSDATA 时按 `quality` 取最高画质;没登录态用 `try_look=1 + platform=html5` 免登录拿 720P/1080P
- 文件写入 `os.tmpdir()`,文件名格式 `bilibili-snapshot-{bvid}-p{page}-{timestamp}s.jpg`
- ffmpeg 超时 30 秒,超时抛 `SNAPSHOT_EXTRACT_FAILED`
```

- [ ] **Step 4: Remove the `#### action: \`stream\`` section entirely**

Find and delete the entire `#### action: \`stream\`` section block.

- [ ] **Step 5: Verify markdown structure**

Run: `grep -c "^#### action:" README.md`
Expected: 6 (info, pages, detail, subtitle, summary, snapshot — no stream).

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: snapshot/info redesign — drop stream, document timestamp branch + available_qualities"
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - Section "Remove stream action" → Task 5 ✓
  - Section "Upgrade snapshot" frame extraction flow → Tasks 6+7+8 ✓
  - Section "Extend info with url + available_qualities" → Task 4 ✓
  - Section "Endpoint auth gate change" → Task 1 ✓
  - Section "ffmpeg-static dependency" → Task 1 ✓
  - Section "Quality description mapping" → Task 2 ✓
  - README docs → Task 9 ✓

- [x] **Type consistency:**
  - `GetPlayUrlInput.tryLook?: boolean` (Task 3) matches `tryLook: true` in `extractFrame` (Task 7) ✓
  - `SelectedStream.quality` defined Task 6; used in `extractFrame` return Task 7 ✓
  - `ExtractFrameResult` shape matches the test assertions in Task 7 and Task 8 ✓
  - `describeQuality(qn): string | null` Task 2 / used Task 7 ✓
  - `getQualityRequirements` returns `{need_login, need_vip}` Task 2 / mapped Task 4 ✓

- [x] **No placeholders:** Every step has concrete file paths, code blocks with full bodies, and exact commands. No "similar to", no "add error handling", no "TBD".
