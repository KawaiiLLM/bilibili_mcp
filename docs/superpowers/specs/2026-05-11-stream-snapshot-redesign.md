# Stream & Snapshot Redesign

## Goal

Remove the `stream` action (raw video stream URLs are useless to LLM consumers), upgrade `snapshot` to extract real frames from video streams via ffmpeg, and surface video quality metadata in `info`.

## Architecture

Three changes to `bilibili_video`:

1. **Remove `stream` action** — `getPlayUrl` stays as internal utility, not exposed via tool
2. **Upgrade `snapshot`** — with `timestamp`: fetch stream → ffmpeg extract frame → return temp file path; without `timestamp`: return sprite sheet metadata (unchanged)
3. **Extend `info`** — add `url` (playable bilibili.com link) and `available_qualities` (from playurl `support_formats`)

## S1: Remove `stream` action

### What changes

- Remove `stream` from the `action` enum in tool schema
- Remove top-level `quality` parameter from tool schema (was only used by `stream`)
- Remove `case "stream"` routing in `video-tool.ts`
- Keep `getPlayUrl()` in `src/modules/video.ts` as internal function (snapshot needs it)

### What stays

- `getPlayUrl()` function signature unchanged
- `get_playurl` endpoint definition stays in `video.json`

## S2: Upgrade `snapshot` action

### Behavior split

| timestamp | behavior |
|---|---|
| not provided | Return sprite sheet metadata via `getSnapshotMeta()` — current behavior, unchanged |
| provided | Fetch video stream → ffmpeg extract frame → return temp file path |

### Tool schema change

`quality` parameter moves from tool-level to snapshot-only context:

```
quality: { type: "number", description: "截图清晰度 qn (snapshot with timestamp only),默认 1080P" }
```

### Frame extraction flow

```
extractFrame(bvid, cid, timestamp, quality?) → { file, timestamp, width, height, quality, quality_desc }
```

Steps:

1. **Get stream URL**: call `getPlayUrl(bvid, cid, opts)` where opts depend on auth state:
   - Has SESSDATA → normal auth, `qn = quality ?? 80`, `fnval = 16`, `fourk = 1`
   - No SESSDATA → `try_look = 1`, `platform = html5`, `qn = quality ?? 80`, `fnval = 16`, `fourk = 1`

2. **Select stream from response**:
   - DASH format (`dash` field present): pick from `dash.video[]` the entry closest to target quality, prefer AVC codec (`codecid === 7`) for compatibility
   - MP4 fallback (`durl` field present): use `durl[0].url`
   - Extract actual `width`, `height`, `quality` from the selected entry

3. **Run ffmpeg**:
   - Binary from `ffmpeg-static` package (require('ffmpeg-static') returns path)
   - Command: `ffmpeg -ss {timestamp} -i {url} -frames:v 1 -q:v 2 {outpath}`
   - `-ss` before `-i` for fast seek
   - Headers: when NOT using `platform=html5`, add `-headers "Referer: https://www.bilibili.com\r\nUser-Agent: {config.userAgent}\r\n"`
   - Timeout: 30 seconds, kill child process on timeout
   - Output path: `{os.tmpdir()}/bilibili-snapshot-{bvid}-p{page}-{timestamp}s.jpg`

4. **Return**:
   ```json
   {
     "file": "/tmp/bilibili-snapshot-BV19v411r76g-p2-60s.jpg",
     "timestamp": 60,
     "width": 1920,
     "height": 1080,
     "quality": 80,
     "quality_desc": "1080P 高清"
   }
   ```

### Auth strategy

| SESSDATA | behavior | expected max quality |
|---|---|---|
| present, normal user | normal auth | 1080P |
| present, VIP | normal auth | 4K/HDR/dolby |
| absent | try_look=1, platform=html5 | 720P-1080P |

The `quality` field in the return always reflects the actual quality obtained, not the requested quality.

### Error handling

| scenario | behavior |
|---|---|
| video not found / page not found | existing validation covers this |
| VIP-only video + no login | try_look gets lower quality; snapshot succeeds at reduced quality |
| ffmpeg execution fails | throw `SNAPSHOT_EXTRACT_FAILED` error with stderr message |
| ffmpeg times out (>30s) | kill process, throw `SNAPSHOT_EXTRACT_TIMEOUT` |
| stream URL fetch fails | throw existing `BILIBILI_*` error, no fallback to sprite sheet |
| timestamp beyond video length | ffmpeg extracts last frame or black frame; no pre-validation |

## S3: Extend `info` action

### New fields in info return

```json
{
  "url": "https://www.bilibili.com/video/BV19v411r76g",
  "available_qualities": [
    { "qn": 120, "desc": "4K 超清", "need_vip": true },
    { "qn": 116, "desc": "1080P60 高帧率", "need_vip": true },
    { "qn": 112, "desc": "1080P+ 高码率", "need_vip": true },
    { "qn": 80,  "desc": "1080P 高清", "need_login": true },
    { "qn": 74,  "desc": "720P60 高帧率", "need_login": true },
    { "qn": 64,  "desc": "720P 高清", "need_login": false },
    { "qn": 32,  "desc": "480P 清晰", "need_login": false },
    { "qn": 16,  "desc": "360P 流畅", "need_login": false }
  ]
}
```

### How to get available_qualities

- `info` handler makes an additional `getPlayUrl()` call with `try_look=1`
- Extract from `support_formats` array in the response
- Map each entry: `{ qn: sf.quality, desc: sf.new_description }`
- Determine `need_login` / `need_vip` by qn value:
  - qn >= 112 → `need_vip: true`
  - qn >= 64 → `need_login: true`
  - otherwise → both false
- If the playurl request fails, omit `available_qualities` from the return; `url` is always present (static concatenation)

### Endpoint change

`src/data/api/video.json` → `get_playurl.auth` changed from `true` to `false`.

The playurl API works without login — it returns `support_formats` listing all available qualities regardless. Only the actual stream URLs are gated by auth. Removing our `auth: true` pre-flight guard allows info to call it without SESSDATA.

## Dependencies

### New npm dependency

- `ffmpeg-static` (^5.3.0) — provides ffmpeg binary for macOS/Linux/Windows, no system install needed

### Internal dependencies

- `child_process.execFile` (Node built-in) — to run ffmpeg
- `os.tmpdir()` (Node built-in) — temp file location
- `fs.promises.access` (Node built-in) — verify output file exists after extraction

## File change list

| file | change |
|---|---|
| `package.json` | add `ffmpeg-static` dependency |
| `src/data/api/video.json` | `get_playurl.auth`: `true` → `false` |
| `src/modules/video.ts` | `getPlayUrl()`: add optional `tryLook`, `platform` params |
| `src/modules/snapshot.ts` | add `extractFrame()`: get stream → select track → run ffmpeg → return file info |
| `src/tools/video-tool.ts` | remove `stream` case; update `snapshot` routing; add `url` + `available_qualities` to `info` return |
| `src/tools/schema.ts` or inline | remove `stream` from action enum; remove top-level `quality`; keep `quality` in snapshot context |
| `README.md` | delete stream section; update snapshot and info docs with new params and return examples |
| `tests/` | add snapshot extraction tests (mock ffmpeg); update info return assertions; remove stream tests |

## Out of scope

- AI voice translation (`cur_language` parameter)
- Other video actions (`detail`, `subtitle`, `summary`, `pages`)
- Other tools (`bilibili_interaction`, `bilibili_discovery`, `bilibili_config`)
- Video download functionality
- Audio-only stream extraction

## Quality description mapping

Static mapping used for `quality_desc` in snapshot return and `desc` in available_qualities:

| qn | desc |
|---|---|
| 6 | 240P 极速 |
| 16 | 360P 流畅 |
| 32 | 480P 清晰 |
| 64 | 720P 高清 |
| 74 | 720P60 高帧率 |
| 80 | 1080P 高清 |
| 100 | 智能修复 |
| 112 | 1080P+ 高码率 |
| 116 | 1080P60 高帧率 |
| 120 | 4K 超清 |
| 125 | HDR 真彩色 |
| 126 | 杜比视界 |
| 127 | 8K 超高清 |

Prefer using `support_formats[].new_description` from the API response when available; fall back to this static table.
