import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../../src/core/config.js";
import { getSpaceVideos } from "../../src/modules/space.js";
import { BilibiliAPIError } from "../../src/core/errors.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

config.enableBiliTicket = false;

function wbiNavStubs(url: URL): Response | null {
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
  return null;
}

test("getSpaceVideos shapes vlist items and joins category names from tlist", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/arc/search") {
      return jsonResponse({
        code: 0,
        data: {
          list: {
            slist: [],
            tlist: {
              "28": { tid: 28, count: 5, name: "原创音乐" },
              "188": { tid: 188, count: 10, name: "数码" },
            },
            vlist: [
              {
                aid: 100,
                bvid: "BV1aaa",
                title: "音乐视频",
                pic: "//i0.hdslb.com/cover-a.jpg",
                length: "06:00",
                description: "曲一",
                created: 1778500000,
                play: 1200,
                video_review: 30,
                comment: 5,
                typeid: 28,
                is_union_video: 0,
                is_live_playback: 0,
                season_id: 0,
                meta: null,
              },
              {
                aid: 101,
                bvid: "BV1bbb",
                title: "评测",
                pic: "//i0.hdslb.com/cover-b.jpg",
                length: "12:34",
                description: "评测一",
                created: 1778400000,
                play: 9000,
                video_review: 100,
                comment: 12,
                typeid: 188,
                is_union_video: 1,
                is_live_playback: 0,
                season_id: 0,
                meta: null,
              },
            ],
          },
          page: { count: 15, pn: 1, ps: 30 },
        },
      });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await getSpaceVideos({ mid: 25329395 });
    assert.equal(result.mid, 25329395);
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].bvid, "BV1aaa");
    assert.equal(result.items[0].url, "https://www.bilibili.com/video/BV1aaa");
    assert.equal(result.items[0].aid, 100);
    assert.equal(result.items[0].title, "音乐视频");
    assert.equal(result.items[0].cover, "https://i0.hdslb.com/cover-a.jpg");
    assert.equal(result.items[0].duration_text, "06:00");
    assert.equal(result.items[0].description, "曲一");
    assert.equal(result.items[0].publish_time, 1778500000);
    assert.deepEqual(result.items[0].stat, { view: 1200, danmaku: 30, comment: 5 });
    assert.deepEqual(result.items[0].category, { tid: 28, name: "原创音乐" });
    assert.equal(result.items[0].is_union_video, false);
    assert.equal(result.items[1].is_union_video, true);
    assert.equal(result.items[1].category.name, "数码");
    assert.deepEqual(result.page, { current: 1, size: 30, total: 15 });
    assert.equal(result.categories.length, 2);
    assert.ok(result.categories.some((c) => c.tid === 28 && c.name === "原创音乐" && c.count === 5));
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("getSpaceVideos passes order and keyword to query", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  let capturedUrl: URL | undefined;
  const fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/arc/search") {
      capturedUrl = url;
      return jsonResponse({ code: 0, data: { list: { slist: [], tlist: {}, vlist: [] }, page: { count: 0, pn: 1, ps: 30 } } });
    }
    return jsonResponse({ code: -404 });
  });

  try {
    await getSpaceVideos({ mid: 1, order: "click", keyword: "FGO" });
    assert.ok(capturedUrl, "expected arc/search to be called");
    assert.equal(capturedUrl!.searchParams.get("mid"), "1");
    assert.equal(capturedUrl!.searchParams.get("order"), "click");
    assert.equal(capturedUrl!.searchParams.get("keyword"), "FGO");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("getSpaceVideos clamps limit to 50", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  let capturedPs: string | null = null;
  const fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/arc/search") {
      capturedPs = url.searchParams.get("ps");
      return jsonResponse({ code: 0, data: { list: { slist: [], tlist: {}, vlist: [] }, page: { count: 0, pn: 1, ps: 50 } } });
    }
    return jsonResponse({ code: -404 });
  });

  try {
    await getSpaceVideos({ mid: 1, limit: 999 });
    assert.equal(capturedPs, "50");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("getSpaceVideos returns empty arrays when vlist is empty", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/arc/search") {
      return jsonResponse({ code: 0, data: { list: { slist: [], tlist: {}, vlist: [] }, page: { count: 0, pn: 1, ps: 30 } } });
    }
    return jsonResponse({ code: -404 });
  });

  try {
    const result = await getSpaceVideos({ mid: 1 });
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.categories, []);
    assert.equal(result.page.total, 0);
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("getSpaceVideos maps meta when present", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/arc/search") {
      return jsonResponse({
        code: 0,
        data: {
          list: {
            slist: [],
            tlist: {},
            vlist: [{
              aid: 1, bvid: "BV1", title: "t", pic: "p", length: "01:00",
              description: "", created: 0, play: 0, video_review: 0, comment: 0, typeid: 0,
              is_union_video: 0, is_live_playback: 0,
              season_id: 42,
              meta: { id: 42, title: "我的合集", intro: "合集描述" },
            }],
          },
          page: { count: 1, pn: 1, ps: 30 },
        },
      });
    }
    return jsonResponse({ code: -404 });
  });

  try {
    const result = await getSpaceVideos({ mid: 1 });
    assert.equal(result.items[0].season_id, 42);
    assert.deepEqual(result.items[0].meta, { id: 42, title: "我的合集", intro: "合集描述" });
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("getSpaceVideos propagates BilibiliAPIError on upstream -412", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/arc/search") {
      return jsonResponse({ code: -412, message: "请求被拦截" });
    }
    return jsonResponse({ code: -404 });
  });

  try {
    await assert.rejects(
      () => getSpaceVideos({ mid: 1 }),
      (err) => err instanceof BilibiliAPIError && err.code === "BILIBILI_AUTH_REQUIRED",
    );
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});
