# Changelog

All notable changes to this project will be documented in this file. Dates are in `YYYY-MM-DD` (UTC+08).

## [0.3.0] — 2026-05-11

Anti-spider parity with the reference `bilibili-api` Python project. Six gaps closed across the request pipeline, plus one delivery fix.

### Added

- `opus-goback=1` cookie injected on every outbound request, matching the reference "came-from-web" signal (lowers `-352`/`-412` hit rate on opus/dynamic endpoints).
- `csrf_token` body field written alongside `csrf` on POST/DELETE/PATCH bodies, fixing `-111 csrf 校验失败` on dynamic/opus/article writes.
- Pre-flight credential checks in `client.ts`: `endpoint.auth` without SESSDATA throws `BILIBILI_COOKIE_INVALID` and `endpoint.csrf` without `bili_jct` throws `BILIBILI_CSRF_MISSING` — both fail fast with **zero network calls**.
- Bounded WBI retry budget (`config.wbiRetryTimes`, default 3, env `BILIBILI_MCP_WBI_RETRY_TIMES`). Both `-352` and `-403` on WBI endpoints clear the mixin_key cache and retry up to the budget. `-412` (IP throttle) does **not** retry.
- `getBiliTicket({ cookieHeader })` accepts the in-flight credential + buvid + opus-goback bundle; logged-in users get higher-trust tickets, cold-start ticket fetches look less robotic to the server.
- Shared `appendCookieFragment` helper (`src/core/cookies.ts`) consolidates cookie joining; three callsites in `buvid.ts`, `client.ts`, and the new `opus-goback` path now share one implementation.
- 16 new tests covering each behavior in isolation plus an end-to-end integration smoke that proves the final WBI request Cookie contains opus-goback + bili_ticket and that the GenWebTicket request itself inherits opus-goback.

### Changed

- `performWithAuthRefresh` rewritten as a bounded for-loop. The pre-flight short-circuit (synthesized `BILIBILI_COOKIE_INVALID` without `originalError`) preempts retry/refresh paths.
- `resolveCredential` now swallows `COOKIECLOUD_CONFIG_INVALID` and returns `undefined` so the pre-flight checks see the cleanly absent-credential case.
- `isWbiSignatureFailure` renamed `isWbiRecoverable`. Returns true for `-352` and `-403` (key rotation); explicitly excludes `-412` by reading the wrapped payload code.

### Fixed

- `-412` IP throttle no longer wastes the WBI retry budget — only `-403` triggers WBI re-sign loop.
- Cookie equality assertions across `tests/core/client.test.ts`, `tests/modules/auth.test.ts`, `tests/tools/video-tool.test.ts` updated to regex-match patterns (necessary collateral for the always-present `opus-goback` cookie).

### Verified

- 105 tests pass.
- Live smoke through the running MCP server: WBI search with `it's a wonderful life` / `don't worry darling` returns results — the existing `replace(/[!'()*]/g, "")` in `wbi.ts` is not causing `-352`, so no change there.

### Specs & plans

- `docs/superpowers/specs/2026-05-11-anti-spider-parity-design.md`
- `docs/superpowers/plans/2026-05-11-anti-spider-parity.md`

## [0.2.0] — 2026-05-10

Risk-control hardening: buvid activation, bili_ticket, expanded WBI defenses.

### Added

- `ExClimbWuzhi` buvid activation pipeline: SPI fetch + `payload_v3` (genUuidInfoc + murmur3-x64-128 fingerprint) + activation POST. Fire-and-forget after the cookie is materialized so the first business request doesn't block.
- `bili_ticket` (GenWebTicket HMAC-SHA256 with hardcoded secret `XgwSnGZ1p`), in-memory cache with 3-day TTL, concurrent-fetch dedupe.
- WBI anti-fingerprint params (`dm_img_list`, `dm_img_str`, `dm_img_inter`, `dm_cover_img_str`) added via `addWbi2Params` when endpoint sets `wbi2: true`.
- `web_location=1550101` default for WBI requests where endpoint doesn't override.
- `auth.json` catalog (documentation-only): ticket + buvid SPI + buvid activation endpoints.
- Config flags `enableBiliTicket` / `enableBuvidActivation` with env overrides.

### Changed

- Default User-Agent updated to Chrome/147 macOS to align with current B 站 web traffic.
- Tool output normalization (F1-F4) across `video`, `interaction`, `discovery` results.

## [0.1.0] — initial milestone

- CookieCloud-only credential management with AES-256-CBC decryption (CryptoJS compatible).
- JSON-driven endpoint catalog (`src/data/api/*.json`) for video, comment, danmaku, search, ranking, action.
- WBI signing (mixin_key + w_rid) with -352 auto re-sign.
- MCP tools `bilibili_video`, `bilibili_interaction`, `bilibili_discovery`, `bilibili_config`.
- Write operations gated by two-stage `confirmation_token` flow.
- Dual transport: stdio + Streamable HTTP/SSE on configurable port.
- 86 tests baseline.
