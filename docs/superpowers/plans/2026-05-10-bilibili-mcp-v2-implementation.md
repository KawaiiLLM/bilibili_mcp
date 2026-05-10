# Bilibili MCP V2 Implementation Plan

> **Implementation boundary:** `/Users/zhaoqixuan/Projects/bilibili-mcp` is the project root. Do not implement inside `biliscope-mcp/`, `bilibili-api/`, or `bilibili-API-collect/`; those directories are reference-only and ignored by git.

## Goal

Build a new TypeScript ESM Bilibili MCP Server from the repository root, matching `docs/superpowers/specs/2026-05-10-bilibili-mcp-v2-design.md`.

Project identity:

- package name: `bilibili-mcp`
- CLI bin: `bilibili-mcp`
- MCP server name: `bilibili-mcp-server`
- env prefix: `BILIBILI_MCP_*`
- CookieCloud aliases: also accept `COOKIECLOUD_*` and `CC_*`
- forbidden identity leakage: `biliscope-mcp`, `BiliScope`, `BILISCOPE_*`

Reference-only sources:

- `bilibili-api/` for endpoint JSON and WBI/WBI2 behavior
- `biliscope-mcp/` for MCP transport and CookieCloud UX patterns only
- `bilibili-API-collect/` for API docs and `grpc_api/bilibili/community/service/dm/v1/dm.proto`

## Task 1: Root Project Scaffold

Create root-level project files:

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `tsconfig.test.json`
- `README.md`
- `.env.example`
- `scripts/copy-assets.mjs`
- `src/index.ts`
- `src/cli.ts`
- `src/server.ts`
- `src/http-server.ts`
- `tests/index.ts`
- `tests/smoke.test.ts`

Scripts:

- `clean`
- `clean:test`
- `build`: clean, compile, copy JSON/proto assets
- `test`: compile tests and run `node --test dist-test/tests`
- `start`
- `start:http`
- `check`

Dependencies:

- `@modelcontextprotocol/sdk`
- `commander`
- `dotenv`
- `express`
- `protobufjs`
- `quick-lru`

Verification:

```bash
npm install
npm test
npm run build
```

## Task 2: Core Endpoint Infrastructure

Create:

- `src/core/types.ts`
- `src/core/api-loader.ts`
- `src/core/client.ts`
- `src/core/fetch.ts`
- `src/core/wbi.ts`
- `src/core/buvid.ts`
- `src/core/credential.ts`
- `src/core/bvid.ts`
- `src/core/cache.ts`
- `src/core/config.ts`
- `src/core/constants.ts`
- `src/core/errors.ts`
- `src/core/retry.ts`
- `src/core/logger.ts`
- `src/data/api/video.json`
- `src/data/api/comment.json`
- `src/data/api/danmaku.json`
- `src/data/api/search.json`
- `src/data/api/ranking.json`
- `src/data/api/action.json`
- `src/data/proto/dm.proto`
- `tests/core/api-loader.test.ts`
- `tests/core/client.test.ts`
- `tests/helpers/mock-fetch.ts`

Requirements:

- `ApiEndpoint` supports `csrf`, `buvid`, `params_type`, `content_type`, `response_type`, `base_url`, `referer`, `wbi2`, and `defaults`.
- `RequestContext` only carries runtime state: `credential`, `cache`, `signal`.
- `client.ts` handles absolute URL, relative URL + `base_url`, defaults merge, WBI2 before WBI, CookieCloud auth, buvid, CSRF, query/body, form/json, JSON/proto/text/binary, retry, timeout, and structured errors.
- API JSON uses absolute URLs except dynamic XML danmaku path.
- Build copies `src/data/api/*.json` and `src/data/proto/dm.proto` to `dist`.

Verification:

```bash
npm test
npm run build
test -f dist/data/api/video.json
test -f dist/data/proto/dm.proto
```

## Task 3: Domain Modules

Create:

- `src/modules/video.ts`
- `src/modules/subtitle.ts`
- `src/modules/summary.ts`
- `src/modules/snapshot.ts`
- `src/modules/comment.ts`
- `src/modules/danmaku.ts`
- `src/modules/search.ts`
- `src/modules/ranking.ts`
- `src/modules/recommend.ts`
- `src/modules/action.ts`
- `tests/modules/video.test.ts`
- `tests/modules/comment-danmaku.test.ts`
- `tests/modules/discovery.test.ts`
- `tests/modules/action.test.ts`

Requirements:

- Comments use `/x/v2/reply/wbi/main` with `pagination_str={"offset":"..."}` and return `cursor.next_cursor`.
- Replies use `rpid` from comments and map it to Bilibili API query `root`.
- Replies pagination uses public `page` as API `pn`.
- Danmaku supports XML text and Protobuf segment decode via `protobufjs`.
- Writes use form body, automatic CSRF, and CookieCloud credentials.
- `favoriteVideo` default folder fallback: `(attr & 2) === 0` → `title === "默认收藏夹"` → smallest `id`; query includes `up_mid` from `DedeUserID`, `type=2`, and `rid={aid}`.

Verification:

```bash
npm test
npm run build
```

## Task 4: MCP Tool Layer

Create:

- `src/tools/common.ts`
- `src/tools/confirmation.ts`
- `src/tools/video-tool.ts`
- `src/tools/interaction-tool.ts`
- `src/tools/discovery-tool.ts`
- `src/tools/config-tool.ts`
- `tests/tools/tools.test.ts`

Expose exactly four MCP tools:

- `bilibili_video`
- `bilibili_interaction`
- `bilibili_discovery`
- `bilibili_config`

Required actions:

- `bilibili_video`: `info`, `detail`, `subtitle`, `summary`, `snapshot`, `stream`, `pages`
- `bilibili_interaction`: `comments`, `replies`, `danmaku`, `like`, `coin`, `favorite`, `follow`
- `bilibili_discovery`: `search`, `search_type`, `suggest`, `hot`, `ranking`, `weekly`, `must_watch`, `related`
- `bilibili_config`: `setup`, `status`

Interaction schema:

- `page`: danmaku video page and replies page number
- `cursor`: comments cursor
- `mode`: comments sort mode
- `limit`: danmaku/comment size limit
- `rpid`: replies root comment id
- `confirmation_token`: write confirmation token

Confirmation behavior:

- Stage 1 returns `pending: true`, `confirmation_token`, `expires_in_seconds: 300`, and `confirm_hint`; no write is executed.
- Stage 2 validates token against action + canonical params, consumes it once, executes write, and returns `pending: false`.
- Invalid/expired token returns structured `CONFIRMATION_INVALID`.

Verification:

```bash
npm test
npm run build
node -e "import('./dist/server.js').then(m => console.log(m.getTools().map(t => t.name).sort().join('\n')))"
```

## Task 5: README, Local Config, And Smoke Verification

Update:

- `README.md`
- `.env.example`

README must document:

- New project identity (`bilibili-mcp`)
- CookieCloud setup
- exactly four MCP tools
- the write confirmation flow
- local CLI commands

Smoke verification:

```bash
npm test
npm run build
npm run check
node dist/cli.js stdio
BILIBILI_MCP_HTTP_PORT=3001 node dist/cli.js http
git status --short
```

Expected:

- tests pass
- build passes
- `npm run check` passes when CookieCloud is configured; otherwise only fails with explicit missing CookieCloud config
- stdio prints `Bilibili MCP started with stdio transport`
- HTTP prints `Streamable HTTP endpoint: /mcp`
- git working tree is clean except local `.env`
