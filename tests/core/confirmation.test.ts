import test from "node:test";
import assert from "node:assert/strict";
import { createConfirmationStore, timingSafeEqualHex } from "../../src/tools/confirmation.js";

test("confirmation store compares HMAC hashes with timing-safe helper", () => {
  assert.equal(timingSafeEqualHex("a".repeat(64), "a".repeat(64)), true);
  assert.equal(timingSafeEqualHex("a".repeat(64), "b".repeat(64)), false);
  assert.equal(timingSafeEqualHex("a".repeat(64), "a"), false);
});

test("confirmation token mismatch is rejected without consuming matching params", () => {
  const store = createConfirmationStore("secret", 60_000);
  const token = store.create("tool.action", { aid: 1 });
  assert.deepEqual(store.consume(token, "tool.action", { aid: 2 }), { ok: false, reason: "mismatch" });
  assert.deepEqual(store.consume(token, "tool.action", { aid: 1 }), { ok: false, reason: "not_found" });
});
