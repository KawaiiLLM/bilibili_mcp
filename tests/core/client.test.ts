import test from "node:test";
import assert from "node:assert/strict";
import { request } from "../../src/core/client.js";
import { config } from "../../src/core/config.js";
import { cacheManager } from "../../src/core/cache.js";
import { CommentsDisabledError } from "../../src/core/errors.js";
import type { ApiEndpoint, Credential } from "../../src/core/types.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

const credential: Credential = {
  cookieHeader: "SESSDATA=session; bili_jct=csrf-token; DedeUserID=42",
  cookies: [],
};

test("client returns JSON payloads that do not use Bilibili code envelope", async () => {
  config.rateLimitMs = 0;
  const endpoint: ApiEndpoint = {
    url: "https://s.search.bilibili.com/main/hotword",
    method: "GET",
    wbi: false,
    auth: false,
    csrf: false,
    buvid: false,
    params_type: "query",
    response_type: "json",
    defaults: { limit: 10 },
    comment: "hotword",
  };
  const fetchMock = installMockFetch((url) => {
    assert.equal(url.searchParams.get("limit"), "10");
    return jsonResponse({ list: [{ keyword: "bilibili" }] });
  });

  try {
    const result = await request<any>(endpoint);
    assert.deepEqual(result, { list: [{ keyword: "bilibili" }] });
    assert.equal(fetchMock.calls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("client posts form body with defaults and csrf from credential", async () => {
  config.rateLimitMs = 0;
  const endpoint: ApiEndpoint = {
    url: "https://api.bilibili.com/x/test/write",
    method: "POST",
    wbi: false,
    auth: true,
    csrf: true,
    buvid: false,
    params_type: "body",
    content_type: "form",
    response_type: "json",
    defaults: { type: 2 },
    comment: "write",
  };
  const fetchMock = installMockFetch((_url, init) => {
    assert.equal(init.method, "POST");
    assert.equal((init.headers as Record<string, string>)["Content-Type"], "application/x-www-form-urlencoded;charset=UTF-8");
    assert.equal((init.headers as Record<string, string>).Cookie, credential.cookieHeader);
    const body = init.body as URLSearchParams;
    assert.equal(body.get("type"), "2");
    assert.equal(body.get("rid"), "100");
    assert.equal(body.get("csrf"), "csrf-token");
    return jsonResponse({ code: 0, data: { ok: true } });
  });

  try {
    const result = await request(endpoint, { rid: 100 }, { credential });
    assert.deepEqual(result, { ok: true });
  } finally {
    fetchMock.restore();
  }
});

test("client builds relative comment URLs from endpoint base_url", async () => {
  config.rateLimitMs = 0;
  const endpoint: ApiEndpoint = {
    url: "/{cid}.xml",
    method: "GET",
    wbi: false,
    auth: false,
    csrf: false,
    buvid: false,
    params_type: "query",
    response_type: "text",
    base_url: "comment",
    comment: "xml danmaku",
  };
  const fetchMock = installMockFetch((url) => {
    assert.equal(url.toString(), "https://comment.bilibili.com/123.xml");
    return new Response("<i></i>");
  });

  try {
    const result = await request<string>(endpoint, { cid: 123 });
    assert.equal(result, "<i></i>");
  } finally {
    fetchMock.restore();
  }
});

test("client serializes concurrent request starts through rate-limit queue", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 25;
  const endpoint: ApiEndpoint = {
    url: "https://api.bilibili.com/x/test/read",
    method: "GET",
    wbi: false,
    auth: false,
    csrf: false,
    buvid: false,
    params_type: "query",
    response_type: "json",
    comment: "read",
  };
  const starts: number[] = [];
  const fetchMock = installMockFetch(async () => {
    starts.push(Date.now());
    return jsonResponse({ code: 0, data: { ok: true } });
  });

  try {
    await Promise.all([request(endpoint, { id: 1 }), request(endpoint, { id: 2 }), request(endpoint, { id: 3 })]);
    assert.equal(starts.length, 3);
    const gaps = starts.slice(1).map((start, index) => start - starts[index]);
    assert.ok(gaps.every((gap) => gap >= 20), `request starts were not serialized: ${gaps.join(",")}`);
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("client maps Bilibili 12002 to CommentsDisabledError", async () => {
  config.rateLimitMs = 0;
  const endpoint: ApiEndpoint = {
    url: "https://api.bilibili.com/x/v2/reply/wbi/main",
    method: "GET",
    wbi: false,
    auth: false,
    csrf: false,
    buvid: false,
    params_type: "query",
    response_type: "json",
    comment: "comments",
  };
  const fetchMock = installMockFetch(() => jsonResponse({ code: 12002, message: "评论区已关闭" }));

  try {
    await assert.rejects(
      () => request(endpoint, { oid: 1 }),
      (error) => error instanceof CommentsDisabledError && error.code === "COMMENTS_DISABLED",
    );
  } finally {
    fetchMock.restore();
  }
});

test("client uses cacheManager when RequestContext.cache is true", async () => {
  config.rateLimitMs = 0;
  cacheManager.clear();
  let fetchCount = 0;
  const endpoint: ApiEndpoint = {
    url: "https://api.bilibili.com/x/web-interface/view",
    method: "GET",
    wbi: false,
    auth: false,
    csrf: false,
    buvid: false,
    params_type: "query",
    response_type: "json",
    comment: "video info",
  };
  const fetchMock = installMockFetch(() => {
    fetchCount += 1;
    return jsonResponse({ code: 0, data: { title: `fetch-${fetchCount}` } });
  });

  try {
    const first = await request<any>(endpoint, { bvid: "BV1abcdefghi" }, { cache: true });
    const second = await request<any>(endpoint, { bvid: "BV1abcdefghi" }, { cache: true });
    assert.deepEqual(first, { title: "fetch-1" });
    assert.deepEqual(second, { title: "fetch-1" });
    assert.equal(fetchCount, 1);
  } finally {
    fetchMock.restore();
    cacheManager.clear();
  }
});
