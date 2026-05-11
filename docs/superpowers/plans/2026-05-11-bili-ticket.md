# bili_ticket 集成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让所有 WBI 接口请求带 `bili_ticket` cookie（HMAC-SHA256 签名 + 3 天 TTL 缓存），失败时退化为不带 ticket 继续。

**Architecture:** 新模块 `core/ticket.ts` 负责 HMAC 签名、ticket 获取、缓存、并发去重；`core/client.ts` 在 buvid 注入之后追加 ticket cookie；config 加开关。模块用 `fetchWithTimeout` 直调 GenWebTicket（绕开 `client.request()` 防递归注入死锁）。

**Tech Stack:** Node.js `node:crypto.createHmac`、`fetchWithTimeout`（已有）、`logger`（已有）。无新依赖。

**Reference:** `bilibili-api/utils/network.py:1965-2073`

---

### Task 1: HMAC-SHA256 helper

**Files:**
- Create: `src/core/ticket.ts`
- Create: `tests/core/ticket.test.ts`

- [ ] **Step 1: Write failing test for HMAC**

```typescript
// tests/core/ticket.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { _hmacSha256ForTest } from "../../src/core/ticket.js";

test("hmacSha256 produces stable hash for known ticket input", () => {
  // Reference: Python hmac.new(b"XgwSnGZ1p", b"ts1700000000", hashlib.sha256).hexdigest()
  const expected = "bb79f0d980ffbb51597aa1a3e8b55603025cc1322ac766f4c1a98852e6182514";
  assert.equal(_hmacSha256ForTest("XgwSnGZ1p", "ts1700000000"), expected);
});
```

- [ ] **Step 2: Verify the expected hash by running Python locally**

```bash
python3 -c "import hmac, hashlib; print(hmac.new(b'XgwSnGZ1p', b'ts1700000000', hashlib.sha256).hexdigest())"
```

If output differs from `expected`, replace the literal in Step 1.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: `_hmacSha256ForTest is not a function` (module empty)

- [ ] **Step 4: Implement HMAC helper**

```typescript
// src/core/ticket.ts
import { createHmac } from "node:crypto";

const HMAC_SECRET = "XgwSnGZ1p";

function hmacSha256(key: string, message: string): string {
  return createHmac("sha256", key).update(message).digest("hex");
}

// Test seam — not part of public API
export const _hmacSha256ForTest = hmacSha256;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/ticket.ts tests/core/ticket.test.ts
git commit -m "feat: add HMAC-SHA256 helper for bili_ticket signing"
```

---

### Task 2: Add `enableBiliTicket` config flag

**Files:**
- Modify: `src/core/config.ts`
- Create: `tests/core/ticket-config.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/ticket-config.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../../src/core/config.js";

test("enableBiliTicket defaults to true", () => {
  assert.equal(config.enableBiliTicket, true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: `Property 'enableBiliTicket' does not exist on type 'Config'`

- [ ] **Step 3: Add config field**

Edit `src/core/config.ts`:

```typescript
// In Config interface (after wbiCacheExpirationMs):
enableBiliTicket: boolean;

// In DEFAULT_CONFIG (after wbiCacheExpirationMs):
enableBiliTicket: true,

// In config export (after maxCacheSize line):
enableBiliTicket: process.env.BILIBILI_MCP_ENABLE_BILI_TICKET !== "false",
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/config.ts tests/core/ticket-config.test.ts
git commit -m "feat: add enableBiliTicket config flag (default true)"
```

---

### Task 3: Fetch ticket from GenWebTicket endpoint

**Files:**
- Modify: `src/core/ticket.ts`
- Modify: `tests/core/ticket.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/core/ticket.test.ts`:

```typescript
import { clearTicketCache, getBiliTicket } from "../../src/core/ticket.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

test("getBiliTicket fetches ticket via GenWebTicket POST", async () => {
  clearTicketCache();
  let captured: { url: URL; init: RequestInit } | undefined;
  const fetchMock = installMockFetch((url, init) => {
    captured = { url, init };
    return jsonResponse({ code: 0, data: { ticket: "ticket-abc-123" } });
  });
  try {
    const ticket = await getBiliTicket();
    assert.equal(ticket, "ticket-abc-123");
    assert.equal(captured!.init.method, "POST");
    assert.equal(captured!.url.host, "api.bilibili.com");
    assert.ok(captured!.url.pathname.endsWith("/GenWebTicket"));
    assert.equal(captured!.url.searchParams.get("key_id"), "ec02");
    assert.equal(captured!.url.searchParams.get("csrf"), "");
    assert.match(captured!.url.searchParams.get("hexsign") ?? "", /^[0-9a-f]{64}$/);
    assert.match(captured!.url.searchParams.get("context[ts]") ?? "", /^\d{10}$/);
  } finally {
    fetchMock.restore();
    clearTicketCache();
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: `clearTicketCache is not exported`

- [ ] **Step 3: Implement fetchTicket + getBiliTicket (no cache yet)**

Replace `src/core/ticket.ts` contents:

```typescript
import { createHmac } from "node:crypto";
import { DEFAULT_HEADERS } from "./constants.js";
import { fetchWithTimeout } from "./fetch.js";
import { logger } from "./logger.js";

const HMAC_SECRET = "XgwSnGZ1p";
const TICKET_URL = "https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket";

interface CachedTicket {
  value: string;
  expireAt: number;
}

let cached: CachedTicket | null = null;

function hmacSha256(key: string, message: string): string {
  return createHmac("sha256", key).update(message).digest("hex");
}

export const _hmacSha256ForTest = hmacSha256;

export function clearTicketCache(): void {
  cached = null;
}

export async function getBiliTicket(signal?: AbortSignal): Promise<string | undefined> {
  const fetched = await fetchTicket(signal);
  if (!fetched) return undefined;
  cached = fetched;
  return fetched.value;
}

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
      headers: DEFAULT_HEADERS,
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

- [ ] **Step 4: Run test, verify pass**

Run: `npm test`
Expected: All previous tests + new GenWebTicket test pass

- [ ] **Step 5: Commit**

```bash
git add src/core/ticket.ts tests/core/ticket.test.ts
git commit -m "feat: fetch bili_ticket from GenWebTicket endpoint"
```

---

### Task 4: TTL cache + concurrent dedupe

**Files:**
- Modify: `src/core/ticket.ts`
- Modify: `tests/core/ticket.test.ts`

- [ ] **Step 1: Write failing tests**

Add:

```typescript
test("getBiliTicket returns cached value while not expired", async () => {
  clearTicketCache();
  let fetchCount = 0;
  const fetchMock = installMockFetch(() => {
    fetchCount += 1;
    return jsonResponse({ code: 0, data: { ticket: `t-${fetchCount}` } });
  });
  try {
    const first = await getBiliTicket();
    const second = await getBiliTicket();
    assert.equal(first, "t-1");
    assert.equal(second, "t-1");
    assert.equal(fetchCount, 1);
  } finally {
    fetchMock.restore();
    clearTicketCache();
  }
});

test("getBiliTicket dedupes concurrent calls into single fetch", async () => {
  clearTicketCache();
  let fetchCount = 0;
  const fetchMock = installMockFetch(async () => {
    fetchCount += 1;
    await new Promise((r) => setTimeout(r, 20));
    return jsonResponse({ code: 0, data: { ticket: "concurrent" } });
  });
  try {
    const tickets = await Promise.all([
      getBiliTicket(),
      getBiliTicket(),
      getBiliTicket(),
      getBiliTicket(),
    ]);
    assert.deepEqual(tickets, ["concurrent", "concurrent", "concurrent", "concurrent"]);
    assert.equal(fetchCount, 1);
  } finally {
    fetchMock.restore();
    clearTicketCache();
  }
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm test`
Expected: Second test sees `fetchCount=4` (no cache); third sees `fetchCount=4` (no in-flight singleton)

- [ ] **Step 3: Add cache check + in-flight singleton**

Replace `getBiliTicket` in `src/core/ticket.ts`:

```typescript
let inFlight: Promise<CachedTicket | undefined> | null = null;

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

- [ ] **Step 4: Run, verify pass**

Run: `npm test`
Expected: All tests including cache + concurrent dedupe pass

- [ ] **Step 5: Commit**

```bash
git add src/core/ticket.ts tests/core/ticket.test.ts
git commit -m "feat: cache bili_ticket with TTL and dedupe concurrent fetches"
```

---

### Task 5: Failure tolerance (HTTP error, code !== 0)

**Files:**
- Modify: `tests/core/ticket.test.ts`

- [ ] **Step 1: Write failing tests**

Add:

```typescript
test("getBiliTicket returns undefined on HTTP 503", async () => {
  clearTicketCache();
  const fetchMock = installMockFetch(() => new Response("upstream down", { status: 503 }));
  try {
    const ticket = await getBiliTicket();
    assert.equal(ticket, undefined);
  } finally {
    fetchMock.restore();
    clearTicketCache();
  }
});

test("getBiliTicket returns undefined when Bilibili returns code != 0", async () => {
  clearTicketCache();
  const fetchMock = installMockFetch(() =>
    jsonResponse({ code: -101, message: "未登录" }),
  );
  try {
    const ticket = await getBiliTicket();
    assert.equal(ticket, undefined);
  } finally {
    fetchMock.restore();
    clearTicketCache();
  }
});

test("getBiliTicket failure does not poison cache", async () => {
  clearTicketCache();
  let fetchCount = 0;
  const fetchMock = installMockFetch(() => {
    fetchCount += 1;
    if (fetchCount === 1) return new Response("err", { status: 500 });
    return jsonResponse({ code: 0, data: { ticket: "recovered" } });
  });
  try {
    assert.equal(await getBiliTicket(), undefined);
    assert.equal(await getBiliTicket(), "recovered");
    assert.equal(fetchCount, 2);
  } finally {
    fetchMock.restore();
    clearTicketCache();
  }
});
```

- [ ] **Step 2: Run, verify pass (Task 3 implementation already handles failures)**

Run: `npm test`
Expected: All 3 new tests pass (existing impl returns `undefined` for non-200 and code != 0, and does not set `cached`)

If any fail, fix the corresponding branch in `fetchTicket` and rerun.

- [ ] **Step 3: Commit**

```bash
git add tests/core/ticket.test.ts
git commit -m "test: cover bili_ticket failure modes (HTTP error, bad code, recovery)"
```

---

### Task 6: TTL expiry triggers re-fetch

**Files:**
- Modify: `tests/core/ticket.test.ts`

- [ ] **Step 1: Write failing test using fake clock**

Add:

```typescript
test("getBiliTicket re-fetches after TTL expires", async (t) => {
  clearTicketCache();
  let fetchCount = 0;
  const fetchMock = installMockFetch(() => {
    fetchCount += 1;
    return jsonResponse({ code: 0, data: { ticket: `gen-${fetchCount}` } });
  });
  const originalNow = Date.now;
  let fakeNow = 1_700_000_000_000;
  Date.now = () => fakeNow;
  try {
    assert.equal(await getBiliTicket(), "gen-1");
    fakeNow += 2 * 24 * 60 * 60 * 1000; // +2 days, still cached
    assert.equal(await getBiliTicket(), "gen-1");
    assert.equal(fetchCount, 1);
    fakeNow += 2 * 24 * 60 * 60 * 1000; // +2 more days, now 4 days total → expired
    assert.equal(await getBiliTicket(), "gen-2");
    assert.equal(fetchCount, 2);
  } finally {
    Date.now = originalNow;
    fetchMock.restore();
    clearTicketCache();
  }
});
```

- [ ] **Step 2: Run, verify pass (Task 4 cache check already uses `now < cached.expireAt`)**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/core/ticket.test.ts
git commit -m "test: bili_ticket re-fetch on TTL expiry"
```

---

### Task 7: Client integration — inject `bili_ticket` cookie

**Files:**
- Modify: `src/core/client.ts`
- Modify: `tests/core/client.test.ts`

- [ ] **Step 1: Write failing integration test**

Add to `tests/core/client.test.ts`:

```typescript
test("client injects bili_ticket cookie when config.enableBiliTicket is true", async () => {
  const { clearTicketCache } = await import("../../src/core/ticket.js");
  clearTicketCache();
  config.rateLimitMs = 0;
  config.enableBiliTicket = true;
  let businessCookieHeader: string | undefined;
  const fetchMock = installMockFetch((url, init) => {
    if (url.pathname.endsWith("/GenWebTicket")) {
      return jsonResponse({ code: 0, data: { ticket: "ticket-xyz" } });
    }
    businessCookieHeader = (init.headers as Record<string, string>).Cookie;
    return jsonResponse({ code: 0, data: { ok: true } });
  });
  const endpoint: ApiEndpoint = {
    url: "https://api.bilibili.com/x/web-interface/wbi/sample",
    method: "GET",
    wbi: false,
    auth: false,
    csrf: false,
    buvid: false,
    params_type: "query",
    response_type: "json",
    comment: "ticket-injection-target",
  };
  try {
    await request<any>(endpoint);
    assert.match(businessCookieHeader ?? "", /bili_ticket=ticket-xyz/);
    assert.match(businessCookieHeader ?? "", /bili_ticket_expires=\d{10,}/);
  } finally {
    fetchMock.restore();
    clearTicketCache();
  }
});

test("client skips bili_ticket injection when disabled", async () => {
  const { clearTicketCache } = await import("../../src/core/ticket.js");
  clearTicketCache();
  config.rateLimitMs = 0;
  config.enableBiliTicket = false;
  let fetchCount = 0;
  const fetchMock = installMockFetch((url) => {
    fetchCount += 1;
    if (url.pathname.endsWith("/GenWebTicket")) {
      throw new Error("should not be called");
    }
    return jsonResponse({ code: 0, data: { ok: true } });
  });
  const endpoint: ApiEndpoint = {
    url: "https://api.bilibili.com/x/web-interface/sample",
    method: "GET",
    wbi: false, auth: false, csrf: false, buvid: false,
    params_type: "query", response_type: "json",
    comment: "no-ticket-target",
  };
  try {
    await request(endpoint);
    assert.equal(fetchCount, 1); // only business call, no ticket call
  } finally {
    fetchMock.restore();
    clearTicketCache();
    config.enableBiliTicket = true; // restore default for downstream tests
  }
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npm test`
Expected: First test fails — Cookie missing `bili_ticket=...`

- [ ] **Step 3: Export `getBiliTicketCached` from `src/core/ticket.ts`**

Add to `src/core/ticket.ts` (after `clearTicketCache`):

```typescript
export function getBiliTicketCached(): CachedTicket | null {
  return cached;
}
```

- [ ] **Step 4: Add `appendBiliTicket` helper in client.ts**

In `src/core/client.ts`, add a private helper near `appendBuvidCookies` usage:

```typescript
function appendBiliTicket(cookieHeader: string | undefined, ticket: string, expireAt: number): string {
  const ticketCookie = `bili_ticket=${ticket}; bili_ticket_expires=${Math.floor(expireAt / 1000)}`;
  return [cookieHeader, ticketCookie].filter(Boolean).join("; ");
}
```

- [ ] **Step 5: Wire ticket injection into `performRequest`**

In `src/core/client.ts`:

```typescript
// 1. New import at top (alongside the existing ticket imports section):
import { getBiliTicket, getBiliTicketCached } from "./ticket.js";

// 2. After the existing `endpoint.buvid` block (around line 66-69), add:
if (config.enableBiliTicket) {
  const ticket = await getBiliTicket(ctx.signal);
  const cachedInfo = getBiliTicketCached();
  if (ticket && cachedInfo) {
    headers.Cookie = appendBiliTicket(headers.Cookie, ticket, cachedInfo.expireAt);
  }
}
```

- [ ] **Step 6: Run, verify pass**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/core/client.ts src/core/ticket.ts tests/core/client.test.ts
git commit -m "feat: inject bili_ticket cookie into authenticated requests"
```

---

### Task 8: Build + smoke verify

**Files:** none

- [ ] **Step 1: Build dist**

Run: `npm run build`
Expected: clean exit, `dist/core/ticket.js` exists

- [ ] **Step 2: Verify all tests still pass**

Run: `npm test`
Expected: total = previous (56) + new Task tests, all PASS

- [ ] **Step 3: Smoke test against real Bilibili (optional, gated on CookieCloud being up)**

```bash
node --input-type=module -e "
  import('./dist/core/ticket.js').then(async (m) => {
    const t = await m.getBiliTicket();
    console.log('ticket:', t ? t.slice(0, 12) + '...' : '<empty>');
  });
"
```

Expected: prints a ~12-char prefix of a real ticket; if `<empty>`, check stderr for `bili_ticket fetch failed` warn.

- [ ] **Step 4: Note for finishing-a-development-branch**

After this task batch, hand off to `superpowers:finishing-a-development-branch` to decide between merge / push / keep / discard.
