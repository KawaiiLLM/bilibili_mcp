import test from "node:test";
import assert from "node:assert/strict";
import { addWbi2Params, clearWbiCache, withWbiSignature } from "../../src/core/wbi.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

const DM_CHARSET = /^[ABCDEFGHIJK]{2}$/;

function navResponse() {
  return jsonResponse({
    code: 0,
    data: {
      wbi_img: {
        img_url: "https://i0.hdslb.com/bfs/wbi/aabbccddeeff00112233445566778899.png",
        sub_url: "https://i0.hdslb.com/bfs/wbi/99887766554433221100ffeeddccbbaa.png",
      },
    },
  });
}

test("addWbi2Params returns 2-char tokens from the dm charset", () => {
  const params = addWbi2Params({ aid: 1 });
  assert.equal(typeof params.dm_img_str, "string");
  assert.equal(typeof params.dm_cover_img_str, "string");
  assert.match(String(params.dm_img_str), DM_CHARSET);
  assert.match(String(params.dm_cover_img_str), DM_CHARSET);
  assert.equal(params.dm_img_list, "[]");
});

test("withWbiSignature injects default web_location=1550101", async () => {
  clearWbiCache();
  const fetchMock = installMockFetch(() => navResponse());
  try {
    const signed = await withWbiSignature({ aid: 1 });
    assert.equal(signed.web_location, 1550101);
    assert.equal(typeof signed.w_rid, "string");
    assert.equal(typeof signed.wts, "number");
  } finally {
    fetchMock.restore();
    clearWbiCache();
  }
});

test("withWbiSignature preserves caller-provided web_location", async () => {
  clearWbiCache();
  const fetchMock = installMockFetch(() => navResponse());
  try {
    const signed = await withWbiSignature({ aid: 1, web_location: 333.999 });
    assert.equal(signed.web_location, 333.999);
  } finally {
    fetchMock.restore();
    clearWbiCache();
  }
});
