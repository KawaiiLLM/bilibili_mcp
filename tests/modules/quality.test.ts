import test from "node:test";
import assert from "node:assert/strict";
import { describeQuality, getQualityRequirements, QN_DESCRIPTIONS } from "../../src/modules/quality.js";

test("describeQuality returns mapped description for known qn", () => {
  assert.equal(describeQuality(80), "1080P 高清");
  assert.equal(describeQuality(64), "720P 高清");
  assert.equal(describeQuality(16), "360P 流畅");
  assert.equal(describeQuality(120), "4K 超清");
});

test("describeQuality returns null for unknown qn", () => {
  assert.equal(describeQuality(999), null);
  assert.equal(describeQuality(0), null);
});

test("getQualityRequirements classifies vip / login / open by qn", () => {
  assert.deepEqual(getQualityRequirements(120), { need_vip: true, need_login: true });
  assert.deepEqual(getQualityRequirements(112), { need_vip: true, need_login: true });
  assert.deepEqual(getQualityRequirements(80), { need_vip: false, need_login: true });
  assert.deepEqual(getQualityRequirements(64), { need_vip: false, need_login: true });
  assert.deepEqual(getQualityRequirements(32), { need_vip: false, need_login: false });
  assert.deepEqual(getQualityRequirements(16), { need_vip: false, need_login: false });
});

test("QN_DESCRIPTIONS contains all documented qn values", () => {
  for (const qn of [6, 16, 32, 64, 74, 80, 100, 112, 116, 120, 125, 126, 127]) {
    assert.ok(typeof QN_DESCRIPTIONS[qn] === "string", `qn ${qn} should be mapped`);
  }
});
