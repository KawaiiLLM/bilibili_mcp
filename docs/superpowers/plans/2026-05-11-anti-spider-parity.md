# Anti-Spider Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `core/client.ts` and `core/ticket.ts` to parity with `bilibili-api/utils/network.py` on six anti-spider behaviors (H1-H4, M1+M3) per `docs/superpowers/specs/2026-05-11-anti-spider-parity-design.md`.

**Architecture:** Surgical additions inside existing modules — no new layers. Each task lands one cohesive fix with TDD coverage. Tasks 2-7 build on Task 1's shared cookie helper. The retry budget refactor (Task 5) is the largest single change (~30 lines in `performWithAuthRefresh`).

**Tech Stack:** TypeScript ESM, `node:test` runner, `node:assert/strict`, existing `tests/helpers/mock-fetch.ts` for fetch interception. No new deps.

---

## File Structure

**New files:**
- `src/core/cookies.ts` — single shared cookie-string helper (`appendCookieFragment`)
- `tests/core/cookies.test.ts` — unit tests for the helper

**Modified files:**
- `src/core/constants.ts` — add `OPUS_GOBACK_COOKIE`
- `src/core/buvid.ts` — switch `appendBuvidCookies` to use `appendCookieFragment` (refactor only)
- `src/core/client.ts` — six modifications across tasks 2-5: opus-goback inject, csrf_token, pre-flight checks, wbi retry loop, ticket call signature
- `src/core/ticket.ts` — change `getBiliTicket` signature to accept `{ signal, cookieHeader }`
- `src/core/config.ts` — add `wbiRetryTimes` field
- `tests/core/client.test.ts` — update the one Cookie-equality assertion that breaks under opus-goback; add 6 new tests
- `tests/core/ticket.test.ts` — add 1 new test for cookie passthrough

**Untouched:** `errors.ts`, `wbi.ts`, `fetch.ts`, `retry.ts`, `credential.ts`, all `data/api/*.json`, all tools.

---

## Task 1: Extract `appendCookieFragment` shared helper

**Why first:** Tasks 2 and 6 both append cookies; consolidating avoids three near-duplicates. Pure refactor — no behavior change.

**Files:**
- Create: `src/core/cookies.ts`
- Create: `tests/core/cookies.test.ts`
- Modify: `src/core/buvid.ts:30-32` (replace `appendBuvidCookies` body)
- Modify: `src/core/client.ts:258-261` (replace `appendBiliTicket` body)

- [ ] **Step 1: Write the failing test**

Create `tests/core/cookies.test.ts`:

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import { appendCookieFragment } from "../../src/core/cookies.js";

test("appendCookieFragment joins existing header and new fragment with '; '", () => {
  assert.equal(
    appendCookieFragment("SESSDATA=abc", "bili_ticket=xyz"),
    "SESSDATA=abc; bili_ticket=xyz",
  );
});

test("appendCookieFragment returns fragment when header is undefined", () => {
  assert.equal(appendCookieFragment(undefined, "opus-goback=1"), "opus-goback=1");
});

test("appendCookieFragment returns fragment when header is empty string", () => {
  assert.equal(appendCookieFragment("", "opus-goback=1"), "opus-goback=1");
});

test("appendCookieFragment returns existing header unchanged when fragment is empty", () => {
  assert.equal(appendCookieFragment("SESSDATA=abc", ""), "SESSDATA=abc");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="appendCookieFragment"`
Expected: FAIL with `Cannot find module '../../src/core/cookies.js'`

- [ ] **Step 3: Create the helper module**

Create `src/core/cookies.ts`:

```typescript
export function appendCookieFragment(
  cookieHeader: string | undefined,
  fragment: string,
): string {
  return [cookieHeader, fragment].filter(Boolean).join("; ");
}
```

- [ ] **Step 4: Migrate `buvid.ts` to use the helper**

Replace `src/core/buvid.ts:30-32`:

```typescript
export function appendBuvidCookies(cookieHeader: string | undefined, buvid: string): string {
  return [cookieHeader, buvid].filter(Boolean).join("; ");
}
```

with:

```typescript
import { appendCookieFragment } from "./cookies.js";

export function appendBuvidCookies(cookieHeader: string | undefined, buvid: string): string {
  return appendCookieFragment(cookieHeader, buvid);
}
```

(The `import` line goes at the top of `buvid.ts` with the other imports.)

- [ ] **Step 5: Migrate `client.ts` to use the helper**

In `src/core/client.ts`:

1. Add to the imports near line 3-12: `import { appendCookieFragment } from "./cookies.js";`
2. Replace the private `appendBiliTicket` function at lines 258-261:

```typescript
function appendBiliTicket(cookieHeader: string | undefined, ticket: string, expireAt: number): string {
  const ticketCookie = `bili_ticket=${ticket}; bili_ticket_expires=${Math.floor(expireAt / 1000)}`;
  return appendCookieFragment(cookieHeader, ticketCookie);
}
```

- [ ] **Step 6: Run full test suite to verify zero regressions**

Run: `npm test`
Expected: All 89 prior tests still pass + 4 new `appendCookieFragment` tests pass = 93 total.

- [ ] **Step 7: Commit**

```bash
git add src/core/cookies.ts src/core/buvid.ts src/core/client.ts tests/core/cookies.test.ts
git commit -m "refactor: extract appendCookieFragment helper for shared cookie joining"
```

---

## Task 2: H3 — Inject `opus-goback=1` cookie on every request

**Files:**
- Modify: `src/core/constants.ts` (add constant)
- Modify: `src/core/client.ts:72-83` (inject after buvid, before ticket)
- Modify: `tests/core/client.test.ts:60-77` (existing test asserts exact Cookie equality — relax to `match`)
- Add tests in `tests/core/client.test.ts` for opus-goback presence

- [ ] **Step 1: Write the failing test**

Append to `tests/core/client.test.ts`:

```typescript
test("client injects opus-goback=1 cookie on every request", async () => {
  config.rateLimitMs = 0;
  config.enableBiliTicket = false;
  const endpoint: ApiEndpoint = {
    url: "https://api.bilibili.com/x/web-interface/anon",
    method: "GET",
    wbi: false,
    auth: false,
    csrf: false,
    buvid: false,
    params_type: "query",
    response_type: "json",
    comment: "anonymous-read",
  };
  let capturedCookie: string | undefined;
  const fetchMock = installMockFetch((_url, init) => {
    capturedCookie = (init.headers as Record<string, string>).Cookie;
    return jsonResponse({ code: 0, data: { ok: true } });
  });
  try {
    await request<any>(endpoint);
    assert.match(capturedCookie ?? "", /opus-goback=1/);
  } finally {
    fetchMock.restore();
    config.enableBiliTicket = true;
  }
});

test("client injects opus-goback alongside credential cookies", async () => {
  config.rateLimitMs = 0;
  config.enableBiliTicket = false;
  const endpoint: ApiEndpoint = {
    url: "https://api.bilibili.com/x/web-interface/credentialed",
    method: "GET",
    wbi: false,
    auth: true,
    csrf: false,
    buvid: false,
    params_type: "query",
    response_type: "json",
    comment: "auth-read",
  };
  let capturedCookie: string | undefined;
  const fetchMock = installMockFetch((_url, init) => {
    capturedCookie = (init.headers as Record<string, string>).Cookie;
    return jsonResponse({ code: 0, data: { ok: true } });
  });
  try {
    await request<any>(endpoint, {}, { credential });
    assert.match(capturedCookie ?? "", /SESSDATA=session/);
    assert.match(capturedCookie ?? "", /opus-goback=1/);
  } finally {
    fetchMock.restore();
    config.enableBiliTicket = true;
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="opus-goback"`
Expected: FAIL — no `opus-goback` substring in captured Cookie.

- [ ] **Step 3: Add the constant**

In `src/core/constants.ts`, append after line 21:

```typescript
export const OPUS_GOBACK_COOKIE = "opus-goback=1";
```

- [ ] **Step 4: Inject in `client.ts`**

In `src/core/client.ts`, after line 75 (the buvid injection block end), add:

```typescript
headers.Cookie = appendCookieFragment(headers.Cookie, OPUS_GOBACK_COOKIE);
```

Update imports near line 5 — add `OPUS_GOBACK_COOKIE` to the import from `./constants.js`:

```typescript
import { BASE_URLS, DEFAULT_HEADERS, DEFAULT_RETRY_OPTIONS, FORM_CONTENT_TYPE, JSON_CONTENT_TYPE, OPUS_GOBACK_COOKIE, isBaseUrlName } from "./constants.js";
```

- [ ] **Step 5: Fix the existing exact-equality assertion**

Locate `tests/core/client.test.ts:64`:

```typescript
assert.equal((init.headers as Record<string, string>).Cookie, credential.cookieHeader);
```

Replace with:

```typescript
const cookieHeader = (init.headers as Record<string, string>).Cookie;
assert.match(cookieHeader ?? "", new RegExp(credential.cookieHeader.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(cookieHeader ?? "", /opus-goback=1/);
```

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All previous tests pass + 2 new `opus-goback` tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/constants.ts src/core/client.ts tests/core/client.test.ts
git commit -m "feat(client): inject opus-goback=1 cookie on every request"
```

---

## Task 3: H1 — Add `csrf_token` companion to POST body

**Files:**
- Modify: `src/core/client.ts:96-103` (write both `csrf` and `csrf_token`)
- Modify: `tests/core/client.test.ts:45-78` (extend existing test) + add 1 new test for JSON body

- [ ] **Step 1: Write the failing test**

Append to `tests/core/client.test.ts`:

```typescript
test("client adds csrf_token alongside csrf in JSON POST body", async () => {
  config.rateLimitMs = 0;
  config.enableBiliTicket = false;
  const endpoint: ApiEndpoint = {
    url: "https://api.bilibili.com/x/test/json-write",
    method: "POST",
    wbi: false,
    auth: true,
    csrf: true,
    buvid: false,
    params_type: "body",
    content_type: "json",
    response_type: "json",
    comment: "json-write",
  };
  let bodyText: string | undefined;
  const fetchMock = installMockFetch(async (_url, init) => {
    bodyText = init.body as string;
    return jsonResponse({ code: 0, data: { ok: true } });
  });
  try {
    await request(endpoint, { rid: 100 }, { credential });
    const parsed = JSON.parse(bodyText ?? "{}");
    assert.equal(parsed.csrf, "csrf-token");
    assert.equal(parsed.csrf_token, "csrf-token");
  } finally {
    fetchMock.restore();
    config.enableBiliTicket = true;
  }
});
```

Also update the existing test "client posts form body with defaults and csrf from credential" at `tests/core/client.test.ts:45-78`. After the existing `assert.equal(body.get("csrf"), "csrf-token");` line (around line 68), add:

```typescript
assert.equal(body.get("csrf_token"), "csrf-token");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="csrf"`
Expected: FAIL — body has `csrf` but no `csrf_token`.

- [ ] **Step 3: Add `csrf_token` to body params**

In `src/core/client.ts:97-103`, replace:

```typescript
    if (endpoint.csrf) {
      const csrf = getBiliJct(credential);
      if (!csrf) {
        throw new BilibiliAPIError("缺少 bili_jct Cookie，无法提交需要 CSRF 的请求。", "BILIBILI_CSRF_MISSING");
      }
      bodyParams.csrf = csrf;
    }
```

with:

```typescript
    if (endpoint.csrf) {
      const csrf = getBiliJct(credential);
      if (!csrf) {
        throw new BilibiliAPIError("缺少 bili_jct Cookie，无法提交需要 CSRF 的请求。", "BILIBILI_CSRF_MISSING");
      }
      bodyParams.csrf = csrf;
      bodyParams.csrf_token = csrf;
    }
```

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass including the new csrf_token assertions.

- [ ] **Step 5: Commit**

```bash
git add src/core/client.ts tests/core/client.test.ts
git commit -m "feat(client): write csrf_token alongside csrf in POST body"
```

---

## Task 4: H2 — Pre-flight credential checks

**Files:**
- Modify: `src/core/client.ts:62-65` (insert pre-flight checks after `resolveCredential`)
- Add tests in `tests/core/client.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/core/client.test.ts`:

```typescript
test("client refuses auth endpoint without credential and does not fetch", async () => {
  config.rateLimitMs = 0;
  config.enableBiliTicket = false;
  const endpoint: ApiEndpoint = {
    url: "https://api.bilibili.com/x/test/auth-required",
    method: "GET",
    wbi: false,
    auth: true,
    csrf: false,
    buvid: false,
    params_type: "query",
    response_type: "json",
    comment: "auth-required",
  };
  const fetchMock = installMockFetch(() => {
    throw new Error("fetch should not have been called");
  });
  try {
    await assert.rejects(
      () => request(endpoint, {}, { credential: undefined }),
      (error: any) => error?.code === "BILIBILI_COOKIE_INVALID",
    );
    assert.equal(fetchMock.calls.length, 0);
  } finally {
    fetchMock.restore();
    config.enableBiliTicket = true;
  }
});

test("client refuses csrf endpoint without bili_jct and does not fetch", async () => {
  config.rateLimitMs = 0;
  config.enableBiliTicket = false;
  const endpoint: ApiEndpoint = {
    url: "https://api.bilibili.com/x/test/csrf-required",
    method: "POST",
    wbi: false,
    auth: true,
    csrf: true,
    buvid: false,
    params_type: "body",
    content_type: "form",
    response_type: "json",
    comment: "csrf-required",
  };
  const credentialNoJct: Credential = {
    cookieHeader: "SESSDATA=session-only; DedeUserID=42",
    cookies: [],
  };
  const fetchMock = installMockFetch(() => {
    throw new Error("fetch should not have been called");
  });
  try {
    await assert.rejects(
      () => request(endpoint, { rid: 1 }, { credential: credentialNoJct }),
      (error: any) => error?.code === "BILIBILI_CSRF_MISSING",
    );
    assert.equal(fetchMock.calls.length, 0);
  } finally {
    fetchMock.restore();
    config.enableBiliTicket = true;
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="refuses"`
Expected: FAIL — either the request goes through (auth case, since `resolveCredential` returns undefined for unconfigured CookieCloud), or the late CSRF check fires after the body-building branch.

- [ ] **Step 3: Add pre-flight checks**

In `src/core/client.ts`, locate lines 62-65:

```typescript
  const credential = await resolveCredential(endpoint, ctx, forceRefresh);
  if (credential) headers.Cookie = credential.cookieHeader;
```

Replace with:

```typescript
  const credential = await resolveCredential(endpoint, ctx, forceRefresh);
  if (endpoint.auth && !credential?.cookieHeader) {
    throw new BilibiliAPIError(
      "该接口需要登录态，请先通过 bilibili_config 配置 CookieCloud。",
      "BILIBILI_COOKIE_INVALID",
    );
  }
  if (endpoint.csrf && !getBiliJct(credential)) {
    throw new BilibiliAPIError(
      "缺少 bili_jct Cookie，无法提交需要 CSRF 的请求。",
      "BILIBILI_CSRF_MISSING",
    );
  }
  if (credential) headers.Cookie = credential.cookieHeader;
```

(Note: the late CSRF check at lines 99-101 stays as defense-in-depth. It's now unreachable on the happy path but cheap to keep.)

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass including the new pre-flight tests; existing "client posts form body with defaults and csrf from credential" still works because it provides a valid `credential` with bili_jct.

- [ ] **Step 5: Commit**

```bash
git add src/core/client.ts tests/core/client.test.ts
git commit -m "feat(client): enforce pre-flight credential checks before fetch"
```

---

## Task 5: H4 — WBI retry budget + `-403` recovery

**Files:**
- Modify: `src/core/config.ts:13-37` (add `wbiRetryTimes` to interface + default + runtime parse)
- Modify: `src/core/client.ts:27-45` (rewrite `performWithAuthRefresh` as bounded loop) + line 267-269 (`isWbiRecoverable` includes `BILIBILI_AUTH_REQUIRED`)
- Add tests in `tests/core/client.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/core/client.test.ts`:

```typescript
test("client retries WBI endpoint up to wbiRetryTimes on -403", async () => {
  const { clearWbiCache } = await import("../../src/core/wbi.js");
  clearWbiCache();
  config.rateLimitMs = 0;
  config.enableBiliTicket = false;
  config.wbiRetryTimes = 3;
  let navCalls = 0;
  let businessCalls = 0;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/nav") {
      navCalls += 1;
      return jsonResponse({
        code: 0,
        data: {
          wbi_img: {
            img_url: `https://i0.hdslb.com/bfs/wbi/cccc${navCalls}cccccccccccccccccccccccccccc.png`,
            sub_url: `https://i0.hdslb.com/bfs/wbi/dddd${navCalls}dddddddddddddddddddddddddddd.png`,
          },
        },
      });
    }
    businessCalls += 1;
    if (businessCalls < 3) return jsonResponse({ code: -403, message: "access denied" });
    return jsonResponse({ code: 0, data: { ok: true } });
  });
  const endpoint: ApiEndpoint = {
    url: "https://api.bilibili.com/x/web-interface/wbi/retry-403",
    method: "GET",
    wbi: true,
    auth: false,
    csrf: false,
    buvid: false,
    params_type: "query",
    response_type: "json",
    comment: "wbi-retry-403",
  };
  try {
    const result = await request<any>(endpoint);
    assert.deepEqual(result, { ok: true });
    assert.equal(businessCalls, 3);
    assert.equal(navCalls, 3);
  } finally {
    fetchMock.restore();
    clearWbiCache();
  }
});

test("client throws after exhausting wbiRetryTimes on persistent -352", async () => {
  const { clearWbiCache } = await import("../../src/core/wbi.js");
  clearWbiCache();
  config.rateLimitMs = 0;
  config.enableBiliTicket = false;
  config.wbiRetryTimes = 2;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/nav") {
      return jsonResponse({
        code: 0,
        data: {
          wbi_img: {
            img_url: "https://i0.hdslb.com/bfs/wbi/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png",
            sub_url: "https://i0.hdslb.com/bfs/wbi/ffffffffffffffffffffffffffffffff.png",
          },
        },
      });
    }
    return jsonResponse({ code: -352, message: "wbi failed" });
  });
  const endpoint: ApiEndpoint = {
    url: "https://api.bilibili.com/x/web-interface/wbi/exhaust",
    method: "GET",
    wbi: true,
    auth: false,
    csrf: false,
    buvid: false,
    params_type: "query",
    response_type: "json",
    comment: "wbi-exhaust",
  };
  try {
    await assert.rejects(
      () => request(endpoint),
      (error: any) => error?.code === "BILIBILI_WBI_FAILED",
    );
  } finally {
    fetchMock.restore();
    clearWbiCache();
    config.wbiRetryTimes = 3;
  }
});

test("non-WBI endpoint does not loop on -403", async () => {
  config.rateLimitMs = 0;
  config.enableBiliTicket = false;
  config.wbiRetryTimes = 3;
  let calls = 0;
  const fetchMock = installMockFetch(() => {
    calls += 1;
    return jsonResponse({ code: -403, message: "access denied" });
  });
  const endpoint: ApiEndpoint = {
    url: "https://api.bilibili.com/x/test/non-wbi-403",
    method: "GET",
    wbi: false,
    auth: false,
    csrf: false,
    buvid: false,
    params_type: "query",
    response_type: "json",
    comment: "non-wbi-403",
  };
  try {
    await assert.rejects(
      () => request(endpoint),
      (error: any) => error?.code === "BILIBILI_AUTH_REQUIRED",
    );
    assert.equal(calls, 1);
  } finally {
    fetchMock.restore();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="wbiRetry|wbi.*-403|exhaust|non-WBI"`
Expected: FAIL — current code returns -403 as AUTH_REQUIRED without WBI retry; `config.wbiRetryTimes` doesn't exist.

- [ ] **Step 3: Add `wbiRetryTimes` to config**

In `src/core/config.ts`, in the `Config` interface (around line 13-36), add after `wbiCacheExpirationMs: number;`:

```typescript
  wbiRetryTimes: number;
```

In `DEFAULT_CONFIG` (around line 38-62), add after `wbiCacheExpirationMs: 60 * 60 * 1000,`:

```typescript
  wbiRetryTimes: 3,
```

In the runtime `config` object (around line 64-103), add after the `maxCacheSize` line:

```typescript
  wbiRetryTimes: parseIntEnv(process.env.BILIBILI_MCP_WBI_RETRY_TIMES, DEFAULT_CONFIG.wbiRetryTimes),
```

- [ ] **Step 4: Broaden `isWbiSignatureFailure` to `isWbiRecoverable` (rename + broaden)**

In `src/core/client.ts`, replace lines 267-269:

```typescript
function isWbiSignatureFailure(error: unknown): boolean {
  return error instanceof BilibiliAPIError && error.code === "BILIBILI_WBI_FAILED";
}
```

with:

```typescript
function isWbiRecoverable(error: unknown): boolean {
  // BILIBILI_WBI_FAILED ← -352; BILIBILI_AUTH_REQUIRED covers -403/-412.
  // Called only when endpoint.wbi=true, so -403 here means wbi key likely rotated.
  return error instanceof BilibiliAPIError && (
    error.code === "BILIBILI_WBI_FAILED" || error.code === "BILIBILI_AUTH_REQUIRED"
  );
}
```

- [ ] **Step 5: Rewrite `performWithAuthRefresh` as a bounded loop**

In `src/core/client.ts`, replace lines 27-45:

```typescript
async function performWithAuthRefresh<T>(
  endpoint: ApiEndpoint,
  params: RequestParams,
  ctx: RequestContext,
  forceRefresh: boolean,
  wbiRetried = false,
): Promise<T> {
  try {
    return await performRequest(endpoint, params, ctx, forceRefresh);
  } catch (error) {
    if (endpoint.wbi && !wbiRetried && isWbiSignatureFailure(error)) {
      clearWbiCache();
      return performWithAuthRefresh(endpoint, params, ctx, forceRefresh, true);
    }
    if (!endpoint.auth || ctx.credential || forceRefresh || !isAuthFailure(error)) throw error;
    await credentialManager.markAuthFailureAndRefresh();
    return performRequest(endpoint, params, ctx, false);
  }
}
```

with:

```typescript
async function performWithAuthRefresh<T>(
  endpoint: ApiEndpoint,
  params: RequestParams,
  ctx: RequestContext,
  forceRefresh: boolean,
): Promise<T> {
  const maxAttempts = endpoint.wbi ? Math.max(1, config.wbiRetryTimes) : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await performRequest(endpoint, params, ctx, forceRefresh);
    } catch (error) {
      lastError = error;
      if (endpoint.wbi && isWbiRecoverable(error) && attempt < maxAttempts - 1) {
        clearWbiCache();
        continue;
      }
      if (endpoint.auth && !ctx.credential && !forceRefresh && isAuthFailure(error)) {
        await credentialManager.markAuthFailureAndRefresh();
        return performRequest(endpoint, params, ctx, false);
      }
      throw error;
    }
  }
  throw lastError;
}
```

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All previous tests pass + 3 new retry tests pass. Note: the existing `"client clears WBI cache and re-signs once on -352"` test still passes because `wbi=true && wbiRetryTimes=3` allows the single retry it expects (first call -352, second call success, loop exits on success).

- [ ] **Step 7: Commit**

```bash
git add src/core/config.ts src/core/client.ts tests/core/client.test.ts
git commit -m "feat(client): bounded WBI retry budget covering -352 and -403"
```

---

## Task 6: M1+M3 — `getBiliTicket` carries credential and buvid cookies

**Files:**
- Modify: `src/core/ticket.ts:32-79` (broaden `getBiliTicket` signature; thread cookieHeader to `fetchTicket`)
- Modify: `src/core/client.ts:77-83` (call new signature)
- Add tests in `tests/core/ticket.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/core/ticket.test.ts`:

```typescript
test("getBiliTicket attaches provided cookieHeader to GenWebTicket request", async () => {
  clearTicketCache();
  let captured: { url: URL; init: RequestInit } | undefined;
  const fetchMock = installMockFetch((url, init) => {
    captured = { url, init };
    return jsonResponse({ code: 0, data: { ticket: "ticket-with-cookies" } });
  });
  try {
    const cookieHeader = "SESSDATA=abc; buvid3=BUVID-XYZ; opus-goback=1";
    const ticket = await getBiliTicket({ cookieHeader });
    assert.equal(ticket, "ticket-with-cookies");
    const sentCookie = (captured!.init.headers as Record<string, string>).Cookie;
    assert.equal(sentCookie, cookieHeader);
  } finally {
    fetchMock.restore();
    clearTicketCache();
  }
});

test("getBiliTicket omits Cookie header when cookieHeader is not provided", async () => {
  clearTicketCache();
  let captured: { init: RequestInit } | undefined;
  const fetchMock = installMockFetch((_url, init) => {
    captured = { init };
    return jsonResponse({ code: 0, data: { ticket: "anon-ticket" } });
  });
  try {
    await getBiliTicket();
    const headers = captured!.init.headers as Record<string, string>;
    assert.equal(headers.Cookie, undefined);
  } finally {
    fetchMock.restore();
    clearTicketCache();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="GenWebTicket request|cookieHeader is not provided"`
Expected: FAIL — `getBiliTicket({ cookieHeader })` is not a valid call form yet (current signature is `getBiliTicket(signal?)`).

- [ ] **Step 3: Broaden `getBiliTicket` signature**

In `src/core/ticket.ts`, replace lines 32-46:

```typescript
export async function getBiliTicket(signal?: AbortSignal): Promise<string | undefined> {
  const now = Date.now();
  if (cached && now < cached.expireAt) return cached.value;
  if (inFlight) {
    const pending = await inFlight;
    return pending?.value;
  }
  inFlight = fetchTicket(signal).finally(() => {
    inFlight = null;
  });
  const fetched = await inFlight;
  if (!fetched) return undefined;
  cached = fetched;
  return fetched.value;
}
```

with:

```typescript
export interface GetBiliTicketOptions {
  signal?: AbortSignal;
  cookieHeader?: string;
}

export async function getBiliTicket(
  opts?: GetBiliTicketOptions,
): Promise<string | undefined> {
  const now = Date.now();
  if (cached && now < cached.expireAt) return cached.value;
  if (inFlight) {
    const pending = await inFlight;
    return pending?.value;
  }
  inFlight = fetchTicket(opts).finally(() => {
    inFlight = null;
  });
  const fetched = await inFlight;
  if (!fetched) return undefined;
  cached = fetched;
  return fetched.value;
}
```

Then replace `fetchTicket` at lines 48-79:

```typescript
async function fetchTicket(signal?: AbortSignal): Promise<CachedTicket | undefined> {
  const ts = Math.floor(Date.now() / 1000);
  const hexsign = hmacSha256(HMAC_SECRET, `ts${ts}`);
  const url = new URL(TICKET_URL);
  url.searchParams.set("key_id", "ec02");
  url.searchParams.set("hexsign", hexsign);
  url.searchParams.set("context[ts]", String(ts));
  url.searchParams.set("csrf", "");
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS },
      signal,
    });
    if (!response.ok) {
      logger.warn("bili_ticket fetch failed", { status: response.status });
      return undefined;
    }
    const payload = (await response.json()) as { code?: number; data?: { ticket?: string } };
    if (payload?.code !== 0 || typeof payload?.data?.ticket !== "string") {
      logger.warn("bili_ticket response invalid", { code: payload?.code });
      return undefined;
    }
    return {
      value: payload.data.ticket,
      expireAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
    };
  } catch (err) {
    logger.warn("bili_ticket fetch threw", { err: err instanceof Error ? err.message : err });
    return undefined;
  }
}
```

with:

```typescript
async function fetchTicket(opts?: GetBiliTicketOptions): Promise<CachedTicket | undefined> {
  const ts = Math.floor(Date.now() / 1000);
  const hexsign = hmacSha256(HMAC_SECRET, `ts${ts}`);
  const url = new URL(TICKET_URL);
  url.searchParams.set("key_id", "ec02");
  url.searchParams.set("hexsign", hexsign);
  url.searchParams.set("context[ts]", String(ts));
  url.searchParams.set("csrf", "");
  const headers: Record<string, string> = { ...DEFAULT_HEADERS };
  if (opts?.cookieHeader) headers.Cookie = opts.cookieHeader;
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      signal: opts?.signal,
    });
    if (!response.ok) {
      logger.warn("bili_ticket fetch failed", { status: response.status });
      return undefined;
    }
    const payload = (await response.json()) as { code?: number; data?: { ticket?: string } };
    if (payload?.code !== 0 || typeof payload?.data?.ticket !== "string") {
      logger.warn("bili_ticket response invalid", { code: payload?.code });
      return undefined;
    }
    return {
      value: payload.data.ticket,
      expireAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
    };
  } catch (err) {
    logger.warn("bili_ticket fetch threw", { err: err instanceof Error ? err.message : err });
    return undefined;
  }
}
```

- [ ] **Step 4: Update `client.ts` call site**

In `src/core/client.ts`, replace lines 77-83:

```typescript
  if (config.enableBiliTicket && endpoint.wbi) {
    const ticket = await getBiliTicket(ctx.signal);
    const cachedInfo = getBiliTicketCached();
    if (ticket && cachedInfo) {
      headers.Cookie = appendBiliTicket(headers.Cookie, ticket, cachedInfo.expireAt);
    }
  }
```

with:

```typescript
  if (config.enableBiliTicket && endpoint.wbi) {
    const ticket = await getBiliTicket({ signal: ctx.signal, cookieHeader: headers.Cookie });
    const cachedInfo = getBiliTicketCached();
    if (ticket && cachedInfo) {
      headers.Cookie = appendBiliTicket(headers.Cookie, ticket, cachedInfo.expireAt);
    }
  }
```

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All previous tests pass + 2 new ticket cookie tests pass. Existing `getBiliTicket()` calls in `ticket.test.ts` still work because the parameter is optional.

- [ ] **Step 6: Commit**

```bash
git add src/core/ticket.ts src/core/client.ts tests/core/ticket.test.ts
git commit -m "feat(ticket): pass credential and buvid cookies to GenWebTicket"
```

---

## Task 7: End-to-end smoke test + suite verification

**Files:**
- Add 1 integration test in `tests/core/client.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/core/client.test.ts`:

```typescript
test("WBI endpoint final Cookie carries opus-goback + bili_ticket together", async () => {
  const { clearTicketCache } = await import("../../src/core/ticket.js");
  const { clearWbiCache } = await import("../../src/core/wbi.js");
  clearTicketCache();
  clearWbiCache();
  config.rateLimitMs = 0;
  config.enableBiliTicket = true;
  let businessCookieHeader: string | undefined;
  let ticketCookieHeader: string | undefined;
  const fetchMock = installMockFetch((url, init) => {
    if (url.pathname.endsWith("/GenWebTicket")) {
      ticketCookieHeader = (init.headers as Record<string, string>).Cookie;
      return jsonResponse({ code: 0, data: { ticket: "wbi-ticket" } });
    }
    if (url.pathname === "/x/web-interface/nav") {
      return jsonResponse({
        code: 0,
        data: {
          wbi_img: {
            img_url: "https://i0.hdslb.com/bfs/wbi/aabbccddeeff00112233445566778899.png",
            sub_url: "https://i0.hdslb.com/bfs/wbi/99887766554433221100ffeeddccbbaa.png",
          },
        },
      });
    }
    businessCookieHeader = (init.headers as Record<string, string>).Cookie;
    return jsonResponse({ code: 0, data: { ok: true } });
  });
  const endpoint: ApiEndpoint = {
    url: "https://api.bilibili.com/x/web-interface/wbi/integration",
    method: "GET",
    wbi: true,
    auth: false,
    csrf: false,
    buvid: false,
    params_type: "query",
    response_type: "json",
    comment: "integration",
  };
  try {
    await request<any>(endpoint);
    // Business request Cookie carries opus-goback AND bili_ticket
    assert.match(businessCookieHeader ?? "", /opus-goback=1/);
    assert.match(businessCookieHeader ?? "", /bili_ticket=wbi-ticket/);
    // Ticket request inherits the same opus-goback (proof that cookieHeader passthrough works)
    assert.match(ticketCookieHeader ?? "", /opus-goback=1/);
  } finally {
    fetchMock.restore();
    clearTicketCache();
    clearWbiCache();
  }
});
```

- [ ] **Step 2: Run the new test alone first**

Run: `npm test -- --test-name-pattern="opus-goback \+ bili_ticket"`
Expected: PASS — all prior tasks combined should make this work without any extra code change.

If it fails: regression. Stop and diagnose, do not write new production code.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: 89 (original) + 4 (cookies) + 2 (opus-goback) + 1 (csrf_token) + 2 (pre-flight) + 3 (wbi retry) + 2 (ticket cookies) + 1 (integration) = **104 tests pass, 0 fail**.

- [ ] **Step 4: Build the project**

Run: `npm run build`
Expected: tsc emits to `dist/` with no errors.

- [ ] **Step 5: Commit**

```bash
git add tests/core/client.test.ts
git commit -m "test: integration smoke for WBI Cookie carrying opus-goback + bili_ticket"
```

---

## Self-Review Notes (for the executor)

- **Order matters**: Task 2 inserts opus-goback before Task 6's ticket call, so Task 6's `headers.Cookie` passed into `getBiliTicket` already contains opus-goback. The integration test in Task 7 explicitly checks this.
- **`isWbiRecoverable` vs `isWbiSignatureFailure`**: Task 5 renames and broadens. Do not leave the old name behind.
- **`config.wbiRetryTimes` reset in tests**: Tasks 5 and 7 mutate `config.wbiRetryTimes`. The teardown restores it to 3 to avoid bleed-through (Task 5 step 1 second test sets it to 2 then restores).
- **Existing test at `client.test.ts:64`**: only one exact-equality Cookie assertion exists in the entire suite — Task 2 step 5 fixes it. If the executor finds another, treat as a sign they edited the wrong file.
- **Pre-flight checks intentionally don't refresh credentials**: H2's design is to fail fast, not to trigger CookieCloud re-pull. The fall-through `credentialManager.markAuthFailureAndRefresh` path in `performWithAuthRefresh` (Task 5) remains for `-101` after a successful first attempt.
