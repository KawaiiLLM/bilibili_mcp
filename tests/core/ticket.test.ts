import test from "node:test";
import assert from "node:assert/strict";
import { _hmacSha256ForTest } from "../../src/core/ticket.js";

test("hmacSha256 produces stable hash for known ticket input", () => {
  // Reference: Python hmac.new(b"XgwSnGZ1p", b"ts1700000000", hashlib.sha256).hexdigest()
  const expected = "bb79f0d980ffbb51597aa1a3e8b55603025cc1322ac766f4c1a98852e6182514";
  assert.equal(_hmacSha256ForTest("XgwSnGZ1p", "ts1700000000"), expected);
});
