import test from "node:test";
import assert from "node:assert/strict";
import { formatDuration, normalizePages, selectPage, getPlayUrl } from "../../src/modules/video.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";
import { config } from "../../src/core/config.js";

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

test("getPlayUrl forwards optional params (try_look, platform)", async () => {
  config.enableBiliTicket = false;
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  let capturedParams: URLSearchParams | undefined;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/nav") {
      return jsonResponse({
        code: 0,
        data: {
          wbi_img: {
            img_url: "https://i0.hdslb.com/bfs/wbi/abcdefghijklmnopqrstuvwxyz123456.png",
            sub_url: "https://i0.hdslb.com/bfs/wbi/ABCDEFGHIJKLMNOPQRSTUVWXYZ123456.png",
          },
        },
      });
    }
    if (url.pathname === "/x/frontend/finger/spi") {
      return jsonResponse({ code: 0, data: { b_3: "buvid3", b_4: "buvid4" } });
    }
    if (url.pathname === "/x/player/wbi/playurl") {
      capturedParams = url.searchParams;
      return jsonResponse({ code: 0, data: { dash: { video: [], audio: [] } } });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    await getPlayUrl({ bvid: "BV1abcdefghi", cid: 11, qn: 80, tryLook: true, platform: "html5" });
    assert.ok(capturedParams, "playurl was not called");
    assert.equal(capturedParams!.get("bvid"), "BV1abcdefghi");
    assert.equal(capturedParams!.get("cid"), "11");
    assert.equal(capturedParams!.get("qn"), "80");
    assert.equal(capturedParams!.get("try_look"), "1");
    assert.equal(capturedParams!.get("platform"), "html5");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});
