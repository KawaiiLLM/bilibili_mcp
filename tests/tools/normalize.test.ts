import test from "node:test";
import assert from "node:assert/strict";
import {
  stripHtml,
  normalizeAbsoluteUrl,
  colorIntToHex,
  truncateText,
  DANMAKU_MODE_LABELS,
} from "../../src/tools/normalize.js";

test("stripHtml removes tags and collapses whitespace", () => {
  assert.equal(stripHtml("<em>Hello</em>  world"), "Hello world");
  assert.equal(stripHtml(undefined), "");
  assert.equal(stripHtml(null), "");
});

test("normalizeAbsoluteUrl prepends https for protocol-relative urls", () => {
  assert.equal(normalizeAbsoluteUrl("//i0.hdslb.com/cover.jpg"), "https://i0.hdslb.com/cover.jpg");
  assert.equal(normalizeAbsoluteUrl("https://x.com"), "https://x.com");
  assert.equal(normalizeAbsoluteUrl(""), "");
  assert.equal(normalizeAbsoluteUrl(undefined), "");
});

test("colorIntToHex formats integer to padded hex", () => {
  assert.equal(colorIntToHex(16777215), "#ffffff");
  assert.equal(colorIntToHex(0), "#000000");
  assert.equal(colorIntToHex(15138834), "#e70012");
});

test("truncateText cuts at max length and appends ellipsis", () => {
  assert.equal(truncateText("abcdef", 10), "abcdef");
  assert.equal(truncateText("abcdefghijkl", 6), "abcdef…");
  assert.equal(truncateText(undefined, 5), "");
});

test("DANMAKU_MODE_LABELS covers known modes", () => {
  assert.equal(DANMAKU_MODE_LABELS[1], "滚动");
  assert.equal(DANMAKU_MODE_LABELS[4], "底端");
  assert.equal(DANMAKU_MODE_LABELS[5], "顶端");
  assert.equal(DANMAKU_MODE_LABELS[6], "逆向");
  assert.equal(DANMAKU_MODE_LABELS[7], "高级");
  assert.equal(DANMAKU_MODE_LABELS[8], "代码");
  assert.equal(DANMAKU_MODE_LABELS[9], "BAS");
});
