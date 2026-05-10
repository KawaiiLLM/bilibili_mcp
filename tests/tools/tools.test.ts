import test from "node:test";
import assert from "node:assert/strict";
import { BilibiliAPIError, ValidationError } from "../../src/core/errors.js";
import { callTool, getTools } from "../../src/server.js";

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
