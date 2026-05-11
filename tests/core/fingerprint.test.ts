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

import { murmur3x64_128 } from "../../src/core/fingerprint.js";

const VECTORS: Array<{ input: string; expected: string }> = [
  { input: "",                                                   expected: "24700f9f1986800ab4fcc880530dd0ed" },
  { input: "a",                                                  expected: "4ca5e27cea02e8c25578e2936b0061e4" },
  { input: "hello",                                              expected: "e4c67dbb6870107c1129fe575d609dfb" },
  { input: "0123456789abcdef",                                   expected: "bd96b791c5d8e195dea62ef6707241b6" },
  { input: "0123456789abcdefg",                                  expected: "2bac69e7b33aff5167db12a8f2534bcd" },
  { input: '{"payload":"{}"}',                                    expected: "ec07ab0fd2e316de9e9cb61dc3812ddf" },
  { input: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.", expected: "43d2081dbbc9caea2008644b3860ac5f" },
];

for (const { input, expected } of VECTORS) {
  test(`murmur3x64_128(${JSON.stringify(input).slice(0, 24)}..., 31) matches reference`, () => {
    assert.equal(murmur3x64_128(input, 31), expected);
  });
}

import { buildActivationPayload } from "../../src/core/fingerprint.js";

test("buildActivationPayload nests inner JSON under 'payload' key", () => {
  const uuid = "TEST-UUID-VALUE";
  const outer = buildActivationPayload(uuid);
  const parsed = JSON.parse(outer) as { payload: string };
  assert.equal(typeof parsed.payload, "string");
  const inner = JSON.parse(parsed.payload) as Record<string, unknown>;
  assert.equal(inner.df35, uuid);
  assert.equal(typeof inner["5062"], "number");
  // 5062 is a ms timestamp; sanity check it's within a reasonable window of now
  assert.ok(Math.abs(Date.now() - (inner["5062"] as number)) < 5000);
  // Spot check a few hardcoded fields from reference network.py:1703-1869
  assert.equal(inner["3064"], 1);
  assert.equal(inner["6e7c"], "839x959");
  const nested = inner["3c43"] as Record<string, unknown>;
  assert.equal(nested.adca, "MacIntel");
  assert.equal(nested.b8ce, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15");
});

test("buildActivationPayload re-serializes without added whitespace", () => {
  // JSON.stringify default already produces compact JSON; verify round-trip is byte-stable.
  const outer = buildActivationPayload("u");
  const parsed = JSON.parse(outer) as { payload: string };
  assert.equal(JSON.stringify(parsed), outer);
  const inner = JSON.parse(parsed.payload);
  assert.equal(JSON.stringify(inner), parsed.payload);
});
