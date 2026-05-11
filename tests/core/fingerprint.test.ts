import test from "node:test";
import assert from "node:assert/strict";
import { genBLsid } from "../../src/core/fingerprint.js";

test("genBLsid produces 8-hex-prefix_hex-timestamp", () => {
  const value = genBLsid();
  assert.match(value, /^[0-9A-F]{8}_[0-9A-F]+$/);
});

test("genBLsid varies across calls", () => {
  const set = new Set<string>();
  for (let i = 0; i < 5; i += 1) set.add(genBLsid());
  assert.ok(set.size >= 4, `expected variation across 5 calls, got ${set.size} unique`);
});
