import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../../src/core/config.js";
import { BilibiliAPIError, ValidationError } from "../../src/core/errors.js";
import { callTool, getTools } from "../../src/server.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

test("server exposes exactly four MCP tools", () => {
  assert.deepEqual(getTools().map((tool) => tool.name).sort(), [
    "bilibili_config",
    "bilibili_discovery",
    "bilibili_interaction",
    "bilibili_video",
  ]);
});

test("interaction writes require a matching confirmation token", async () => {
  const first = await callTool("bilibili_interaction", { action: "follow", mid: 100 }) as any;
  assert.equal(first.pending, true);
  assert.equal(first.expires_in_seconds, 300);
  assert.equal(typeof first.confirmation_token, "string");

  await assert.rejects(
    () => callTool("bilibili_interaction", {
      action: "follow",
      mid: 200,
      confirmation_token: first.confirmation_token,
    }),
    (error) => error instanceof BilibiliAPIError && error.code === "CONFIRMATION_INVALID",
  );
});

test("config status does not expose CookieCloud password", async () => {
  const status = await callTool("bilibili_config", { action: "status" }) as Record<string, unknown>;
  assert.equal(Object.hasOwn(status, "password"), false);
  assert.equal(Object.hasOwn(status, "password_present"), true);
});

test("read interaction actions reject aid-only targets because cid may be required", async () => {
  await assert.rejects(
    () => callTool("bilibili_interaction", { action: "danmaku", aid: 123 }),
    (error) => error instanceof ValidationError
      && error.message.includes("aid 只能用于写操作"),
  );
});

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
