import test from "node:test";
import assert from "node:assert/strict";
import { formatDuration, normalizePages, selectPage } from "../../src/modules/video.js";

test("video pages normalize from pages list or top-level cid", () => {
  assert.deepEqual(normalizePages({ pages: [{ page: 1, cid: 11, part: "OP", duration: 90 }] }), [
    { page: 1, cid: 11, part: "OP", duration: 90 },
  ]);
  assert.deepEqual(normalizePages({ cid: 22, duration: 30 }), [
    { page: 1, cid: 22, part: "P1", duration: 30 },
  ]);
});

test("video page selection and duration formatting are stable", () => {
  const selected = selectPage({ pages: [{ page: 2, cid: 12, part: "P2", duration: 61 }] }, 2);
  assert.equal(selected.cid, 12);
  assert.equal(formatDuration(61), "01:01");
  assert.equal(formatDuration(0), "00:00");
});
