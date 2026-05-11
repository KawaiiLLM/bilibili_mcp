import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../../src/core/config.js";
import { getSearchSuggestions } from "../../src/modules/search.js";
import { getHomeRecommend } from "../../src/modules/ranking.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

config.enableBiliTicket = false;

test("search suggestions normalize API payload to string array", async () => {
  const fetchMock = installMockFetch(() => jsonResponse({
    code: 0,
    result: {
      tag: [
        { value: "明日方舟" },
        { name: "原神" },
        { term: "崩坏 星穹铁道" },
      ],
    },
  }));

  try {
    const result = await getSearchSuggestions({ keyword: "mi" });
    assert.deepEqual(result, ["明日方舟", "原神", "崩坏 星穹铁道"]);
  } finally {
    fetchMock.restore();
  }
});

test("getHomeRecommend filters to goto=av and shapes items", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
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
    if (url.pathname === "/x/web-interface/wbi/index/top/feed/rcmd") {
      return jsonResponse({
        code: 0,
        data: {
          item: [
            {
              goto: "av",
              bvid: "BV1aaa",
              id: 100,
              cid: 200,
              title: "AV item",
              pic: "//i0.hdslb.com/cover-a.jpg",
              duraion: 360,
              owner: { mid: 1, name: "up-a", face: "//i0.hdslb.com/face-a.jpg" },
              stat: { view: 1000, danmaku: 10, like: 50 },
              pubdate: 1778500000,
              is_followed: 1,
              rcmd_reason: { reason_type: 1, content: "已关注" },
            },
            { goto: "live", bvid: "BV1bbb", title: "live entry" },
            { goto: "ogv", bvid: "BV1ccc", title: "sidebar entry" },
          ],
        },
      });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await getHomeRecommend({ limit: 10 });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].bvid, "BV1aaa");
    assert.equal(result.items[0].aid, 100);
    assert.equal(result.items[0].cid, 200);
    assert.equal(result.items[0].title, "AV item");
    assert.equal(result.items[0].cover, "https://i0.hdslb.com/cover-a.jpg");
    assert.equal(result.items[0].duration_seconds, 360);
    assert.equal(result.items[0].duration_text, "06:00");
    assert.deepEqual(result.items[0].owner, { mid: 1, name: "up-a", avatar: "https://i0.hdslb.com/face-a.jpg" });
    assert.deepEqual(result.items[0].stat, { view: 1000, danmaku: 10, like: 50 });
    assert.equal(result.items[0].is_followed, true);
    assert.equal(result.items[0].reason, "已关注");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("getHomeRecommend maps rcmd_reason types", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
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
    if (url.pathname === "/x/web-interface/wbi/index/top/feed/rcmd") {
      return jsonResponse({
        code: 0,
        data: {
          item: [
            { goto: "av", bvid: "BV1", id: 1, cid: 1, title: "t1", pic: "p", duraion: 60, owner: { mid: 1, name: "u", face: "f" }, stat: {}, pubdate: 0, rcmd_reason: { reason_type: 0 } },
            { goto: "av", bvid: "BV2", id: 2, cid: 2, title: "t2", pic: "p", duraion: 60, owner: { mid: 2, name: "u", face: "f" }, stat: {}, pubdate: 0, rcmd_reason: { reason_type: 1, content: "已关注" } },
            { goto: "av", bvid: "BV3", id: 3, cid: 3, title: "t3", pic: "p", duraion: 60, owner: { mid: 3, name: "u", face: "f" }, stat: {}, pubdate: 0, rcmd_reason: { reason_type: 3, content: "高点赞" } },
          ],
        },
      });
    }
    return jsonResponse({ code: -404 });
  });

  try {
    const result = await getHomeRecommend({});
    assert.equal(result.items[0].reason, null);
    assert.equal(result.items[1].reason, "已关注");
    assert.equal(result.items[2].reason, "高点赞");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("getHomeRecommend caps limit at 30 in upstream request", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  let capturedPs: string | null = null;
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
    if (url.pathname === "/x/web-interface/wbi/index/top/feed/rcmd") {
      capturedPs = url.searchParams.get("ps");
      return jsonResponse({ code: 0, data: { item: [] } });
    }
    return jsonResponse({ code: -404 });
  });

  try {
    await getHomeRecommend({ limit: 500 });
    assert.equal(capturedPs, "30");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});
