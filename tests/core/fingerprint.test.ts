import test from "node:test";
import assert from "node:assert/strict";
import { genBLsid, genUuidInfoc } from "../../src/core/fingerprint.js";

test("genBLsid produces 8-hex-prefix_hex-timestamp", () => {
  const value = genBLsid();
  assert.match(value, /^[0-9A-F]{8}_[0-9A-F]+$/);
});

test("genBLsid varies across calls", () => {
  const set = new Set<string>();
  for (let i = 0; i < 5; i += 1) set.add(genBLsid());
  assert.ok(set.size >= 4, `expected variation across 5 calls, got ${set.size} unique`);
});

test("genUuidInfoc matches reference 8-4-4-4-12 + 5-digit + infoc pattern", () => {
  const value = genUuidInfoc();
  // Reference candidate alphabet includes "10" (two chars), so the 8-4-4-4-12 groups may be longer.
  // Accept both shapes: each char comes from {1-9,A-F,10}, joined directly.
  assert.match(value, /^[1-9A-F0]+-[1-9A-F0]+-[1-9A-F0]+-[1-9A-F0]+-[1-9A-F0]+\d{5}infoc$/);
  assert.ok(value.endsWith("infoc"));
});

test("genUuidInfoc varies across calls", () => {
  const set = new Set<string>();
  for (let i = 0; i < 5; i += 1) set.add(genUuidInfoc());
  assert.ok(set.size >= 4, `expected variation across 5 calls, got ${set.size} unique`);
});
