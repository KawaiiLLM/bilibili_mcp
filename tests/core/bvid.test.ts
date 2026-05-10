import test from "node:test";
import assert from "node:assert/strict";
import { extractAid, extractBVId, isValidAid } from "../../src/core/bvid.js";

test("video id parser supports BV and AV inputs", () => {
  assert.equal(extractBVId("https://www.bilibili.com/video/BV1abcdefghi"), "BV1abcdefghi");
  assert.equal(extractAid("av170001"), 170001);
  assert.equal(extractAid("https://www.bilibili.com/video/av170001"), 170001);
  assert.equal(isValidAid("170001"), true);
  assert.equal(isValidAid("av170001"), true);
});
