# Discovery Feeds — home recommendation & followed-UP video updates

## Goal

Add two recommendation/feed actions to `bilibili_discovery`:

1. **`home`** — homepage video recommendation feed (`/x/web-interface/wbi/index/top/feed/rcmd`). Personalized when logged in, generic when not.
2. **`following`** — videos posted by followed UPs, sourced from the dynamic feed (`/x/polymer/web-dynamic/v1/feed/all?type=video`). Login required.

Both surface "what should I watch" — same conceptual surface as existing `hot` / `ranking` / `weekly` / `must_watch`, but personalized/social rather than platform-curated.

## Architecture

- Keep `bilibili_discovery` as the single discovery surface. No new tool.
- Two endpoints registered in JSON catalogs (`ranking.json` for `recommend`, new `dynamic.json` for `feed_all`).
- Two module functions: `getHomeRecommend()` and `getFollowingVideos()` in `src/modules/discovery.ts`.
- Each function shapes the raw upstream payload into a stable, LLM-friendly contract.
- Tool layer adds two switch cases.

## S1: `home` action

### Upstream

```
GET https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd
```

| trait | value |
|---|---|
| WBI signed | yes (the URL itself sits behind `/wbi/`) |
| Auth | optional — without SESSDATA returns generic recs; with SESSDATA personalizes |
| Max per page | 30 (`ps` param, default 12) |
| Pagination | quasi-pagination via `fresh_idx`; first call is enough for most LLM use cases |
| Returns | `data.item[]` containing videos + ads + sidebar entries |

### Tool params

```
{
  action: "home",
  limit?: number   // default 20, capped at 30
}
```

No cursor — first call returns one fresh batch; caller re-invokes for a new batch (server picks new content based on `fresh_idx` rotation).

### Implementation steps

1. `getHomeRecommend(opts: { limit?: number }, ctx?: RequestContext)` calls the endpoint with `ps = clamp(limit ?? 20, 1, 30)`, `fresh_idx = 1`, `fresh_idx_1h = 1`, `brush = 1`, `fetch_row = 1`, `web_location = 1430650`, `homepage_ver = 1`, `feed_version = "V8"`.
2. SESSDATA passes through normal credential pipeline (no `try_look` here — empty cookie also works, just less personalized).
3. Filter `data.item[]` to entries where `goto === "av"`. Drop ads (`business_info != null`), live (`goto === "live"`), sidebar (`goto === "ogv"`).
4. Map each item:

```ts
{
  bvid: item.bvid,
  aid: Number(item.id),
  cid: Number(item.cid),
  title: item.title,
  cover: normalizeAbsoluteUrl(item.pic),
  duration_seconds: Number(item.duraion),  // upstream typo: "duraion"
  duration_text: formatDuration(item.duraion),
  owner: {
    mid: Number(item.owner.mid),
    name: item.owner.name,
    avatar: normalizeAbsoluteUrl(item.owner.face)
  },
  stat: {
    view: Number(item.stat.view ?? 0),
    danmaku: Number(item.stat.danmaku ?? 0),
    like: Number(item.stat.like ?? 0)
  },
  publish_time: Number(item.pubdate),
  publish_text: formatTimestamp(item.pubdate),
  is_followed: Boolean(item.is_followed),
  reason: mapRcmdReason(item.rcmd_reason)
}
```

Where `mapRcmdReason`:

| `reason_type` | output `reason` |
|---|---|
| 0 / missing | `null` |
| 1 | `"已关注"` |
| 3 | `"高点赞"` |
| other | upstream `content` string verbatim |

### Return shape

```json
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
      "publish_text": "2026-05-11 14:22",
      "is_followed": true,
      "reason": "已关注"
    }
  ]
}
```

### Errors

| scenario | behavior |
|---|---|
| upstream `code !== 0` | throw `BilibiliAPIError` (existing pipeline handles) |
| upstream returns empty `item[]` | return `{ items: [] }` |
| filter drops everything (all ads/live) | return `{ items: [] }` |

## S2: `following` action

### Upstream

```
GET https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all
    ?type=video
    &timezone_offset=-480
    &offset=<id_str | empty>
    &platform=web
    &features=itemOpusStyle,listOnlyfans
```

| trait | value |
|---|---|
| WBI signed | no |
| Auth | **required** — `-101` if no SESSDATA |
| Pagination | cursor-based: `data.offset` (= last item's `id_str`) |
| Filter | `type=video` keeps only video-related dynamic types (DYNAMIC_TYPE_AV, DYNAMIC_TYPE_FORWARD-of-video, DYNAMIC_TYPE_UGC_SEASON) |
| Returns | `data.items[]` with `data.has_more`, `data.offset`, `data.update_baseline` |

### Tool params

```
{
  action: "following",
  limit?: number,    // soft; upstream returns ~10-15 per page; we don't pass ps
  cursor?: string    // pass back the cursor from previous call to fetch older
}
```

`limit` here serves as a client-side cap on the response array (trim to `limit` after we map). B 站 doesn't accept a `ps` for this endpoint.

### Implementation steps

1. `getFollowingVideos(opts: { cursor?: string; limit?: number }, ctx?: RequestContext)`.
2. `endpoint.auth = true` → pre-flight rejects if SESSDATA missing → throws `BilibiliAPIError.MISSING_SESSDATA`.
3. Pass `offset = opts.cursor ?? ""`.
4. Iterate `data.items[]`, keep entries where `type === "DYNAMIC_TYPE_AV"` and `modules.module_dynamic.major?.type === "MAJOR_TYPE_ARCHIVE"`.
   - Optional: also keep `DYNAMIC_TYPE_UGC_SEASON` (合集更新) — same `archive` shape.
   - Drop `DYNAMIC_TYPE_FORWARD` for v1 (forwarded videos add complexity; revisit).
5. Map each kept item:

```ts
{
  bvid: archive.bvid,
  aid: Number(archive.aid),
  title: archive.title,
  cover: normalizeAbsoluteUrl(archive.cover),
  duration_text: archive.duration_text,
  desc: archive.desc,
  jump_url: normalizeAbsoluteUrl(archive.jump_url),
  stat: {
    view: Number(archive.stat?.play ?? 0),
    danmaku: Number(archive.stat?.danmaku ?? 0)
  },
  publish_time: Number(author.pub_ts),
  publish_text: author.pub_time,    // "刚刚" / "5 分钟前" / "11-10 14:22"
  author: {
    mid: Number(author.mid),
    name: author.name,
    avatar: normalizeAbsoluteUrl(author.face)
  },
  dynamic_id: item.id_str           // for later traceability
}
```

6. Trim mapped array to `opts.limit ?? 15`.
7. Return `cursor = data.offset || null`, `has_more = data.has_more`, `update_baseline = data.update_baseline`.

### Return shape

```json
{
  "items": [
    {
      "bvid": "BV1xxxx",
      "aid": 12345,
      "title": "视频标题",
      "cover": "https://i0.hdslb.com/bfs/archive/xxx.jpg",
      "duration_text": "06:00",
      "desc": "视频简介(动态描述,可能为空字符串)",
      "jump_url": "https://www.bilibili.com/video/BV1xxxx/",
      "stat": { "view": 1234, "danmaku": 5 },
      "publish_time": 1778500000,
      "publish_text": "刚刚",
      "author": {
        "mid": 25329395,
        "name": "UP主",
        "avatar": "https://..."
      },
      "dynamic_id": "966887968322093078"
    }
  ],
  "cursor": "966873782060843027",
  "has_more": true,
  "update_baseline": "966887968322093078"
}
```

### Why no view-stat parity with `home`

Dynamic feed's `archive.stat` only carries `play` + `danmaku`. No `like` count, no `coin`, no `favorite`. Caller can call `bilibili_video info` with the returned `bvid` to get full stats if needed. We don't auto-enrich because that would N× the request count.

### Errors

| scenario | behavior |
|---|---|
| no SESSDATA | pre-flight throws `MISSING_SESSDATA` with suggestion "先用 `bilibili_config setup` 配置 CookieCloud" |
| SESSDATA expired (upstream `code === -101`) | rethrow as `MISSING_SESSDATA` (consistent) |
| upstream `code !== 0` other | throw `BilibiliAPIError` |
| empty items / no follows / page exhausted | return `{ items: [], cursor: null, has_more: false }` |
| cursor format invalid (B 站 will return code 0 but `items: []`) | return empty page; no special error |

## S3: Tool & schema changes

### `src/tools/discovery-tool.ts`

```ts
const DISCOVERY_ACTIONS = [
  "search", "search_type", "suggest",
  "hot", "ranking", "weekly", "must_watch",
  "related",
  "home", "following"      // new
] as const;
```

Add to argument allow-list: `"cursor"`.

Switch cases:

```ts
case "home":
  return getHomeRecommend({ limit }, ctx);
case "following":
  return getFollowingVideos({ cursor, limit }, ctx);
```

Schema additions:

```ts
cursor: { type: "string", description: "翻页游标(仅 following 用,传上次返回的 cursor)" }
```

### `src/data/api/ranking.json`

Add under `popular`:

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

### `src/data/api/dynamic.json` (new file)

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

### `src/modules/discovery.ts`

Add two exported functions and a couple of internal helpers (`mapRcmdReason`, `formatDuration`, `formatTimestamp`). Reuse `normalizeAbsoluteUrl` from `src/tools/normalize.ts`.

`formatDuration(seconds: number) → "MM:SS" | "HH:MM:SS"` — duplicates existing helper in `video.ts` if present; otherwise inline a small one. Check for an existing helper first; do not duplicate.

`formatTimestamp(unixSec: number) → "YYYY-MM-DD HH:mm"` — use `Date` ISO and trim. Internal only; doesn't need locale.

## Auth strategy summary

| action | SESSDATA absent | SESSDATA present |
|---|---|---|
| `home` | generic recs (no preflight block) | personalized recs |
| `following` | **pre-flight blocks**, throws `MISSING_SESSDATA` | normal |

## Error type additions

No new error classes. Re-use:

- `BilibiliAPIError` with `code: "MISSING_SESSDATA"` (already exists from `auth: true` preflight).
- Validation errors via existing `ValidationError` for bad `limit` / `cursor`.

## Tests

`tests/modules/discovery.test.ts` — extend existing file. Add:

1. `getHomeRecommend filters to goto=av and shapes items` — mock fetch returns mixed `item[]` (av + live + ogv + ad), assert only AVs survive, fields mapped.
2. `getHomeRecommend maps rcmd_reason types` — three items with `reason_type` 0/1/3, assert `null/"已关注"/"高点赞"`.
3. `getHomeRecommend respects limit cap` — pass `limit=50`, assert request `ps=30`.
4. `getFollowingVideos requires SESSDATA` — no credential, assert throws `MISSING_SESSDATA`.
5. `getFollowingVideos maps DYNAMIC_TYPE_AV items` — full mock with one AV + one WORD + one FORWARD; assert WORD/FORWARD dropped, AV mapped.
6. `getFollowingVideos returns cursor + has_more` — mock `data.offset = "abc"`, `data.has_more = true`; assert passthrough.
7. `getFollowingVideos trims to limit` — mock returns 10 items, request `limit=3`; assert returned `items.length === 3`.

`tests/tools/discovery-tool.test.ts` — extend. Add:

8. tool dispatches `home` to module fn with `limit`.
9. tool dispatches `following` to module fn with `cursor + limit`.
10. tool rejects unknown actions still produces existing ValidationError (regression).

Total: ~10 new tests. Existing 122 stay green.

## README updates

Under `## 工具` → `### bilibili_discovery`:

- Add `home` to action table with: 描述、参数、返回示例
- Add `following` to action table with: 描述、参数、登录要求、cursor 翻页用法、返回示例

Reuse the style already used for `hot` and `ranking`.

## File change list

| file | change |
|---|---|
| `src/data/api/ranking.json` | add `popular.recommend` entry |
| `src/data/api/dynamic.json` | **new** — register `feed.all` |
| `src/modules/discovery.ts` | add `getHomeRecommend`, `getFollowingVideos`, helpers |
| `src/tools/discovery-tool.ts` | extend `DISCOVERY_ACTIONS`, route two new cases, allow `cursor` arg |
| `tests/modules/discovery.test.ts` | 7 new tests |
| `tests/tools/discovery-tool.test.ts` | 3 new tests |
| `README.md` | new `home` / `following` doc blocks in discovery section |
| `package.json` | bump 0.3.2 → 0.3.3 |

## Out of scope

- Personalized "dislike" / blacklist signal injection on `home` requests.
- Forwarded video dynamics (`DYNAMIC_TYPE_FORWARD`) on `following`.
- Live recommendation entries on `home` (we filter them out).
- Sidebar recommendation column from `home` payload's `side_bar_column`.
- Other dynamic types (text, image, article) on `following` — this action is video-only by design.
- Per-video stat backfill on `following` items (caller calls `bilibili_video info` if needed).
- Cursor pagination on `home`.
- WS push / long-poll for new dynamics.

## Versioning

Release as **0.3.3** — additive change, no breaking modifications. Marketplace `claude-beats` bumps in lockstep.

## Reference

Upstream API contracts verified against `bilibili-API-collect/docs/`:

- `docs/video/recommend.md#获取首页视频推荐列表（web端）`
- `docs/dynamic/all.md#获取全部动态列表`
- `docs/dynamic/dynamic_enum.md#动态类型`
