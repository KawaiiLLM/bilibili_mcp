import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../../src/core/config.js";
import { callTool } from "../../src/server.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

config.enableBiliTicket = false;

test("discovery related normalizes video cards and applies limit", async () => {
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/view") {
      return jsonResponse({
        code: 0,
        data: {
          bvid: "BV1abcdefghi",
          aid: 1,
          cid: 11,
          pages: [{ page: 1, cid: 11, part: "P1", duration: 60 }],
        },
      });
    }
    if (url.pathname === "/x/web-interface/archive/related") {
      return jsonResponse({
        code: 0,
        data: [
          {
            aid: 2,
            bvid: "BV2abcdefghi",
            cid: 22,
            title: "相关 <em>视频</em>",
            desc: "推荐说明",
            duration: 61,
            pic: "http://i0.hdslb.com/cover.jpg",
            tname: "动画",
            owner: { mid: 42, name: "UP", face: "avatar.jpg" },
            stat: { view: 100, danmaku: 2, reply: 3, favorite: 4, coin: 5, share: 6, like: 7 },
            rights: { download: 0 },
            dimension: { width: 1920, height: 1080 },
          },
          { aid: 3, bvid: "BV3abcdefghi", title: "should be limited" },
        ],
      });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await callTool("discovery", {
      action: "related",
      input: "BV1abcdefghi",
      limit: 1,
    }) as any;

    assert.equal(result.bvid, "BV1abcdefghi");
    assert.equal(result.aid, 1);
    assert.equal(result.list.length, 1);
    const card = result.list[0];
    assert.equal(card.bvid, "BV2abcdefghi");
    assert.equal(card.aid, 2);
    assert.equal(card.title, "相关 视频");
    assert.equal(card.url, "https://www.bilibili.com/video/BV2abcdefghi");
    assert.equal(card.cover, "http://i0.hdslb.com/cover.jpg");
    assert.deepEqual(card.owner, { mid: 42, name: "UP", avatar: "avatar.jpg" });
    assert.equal(card.duration_text, "01:01");
    assert.equal(card.description, "推荐说明");
    assert.equal(card.category, "动画");
    assert.equal(card.stat.view, 100);
    // 噪音字段不出现
    const cardKeys = Object.keys(card);
    assert.ok(!cardKeys.includes("rights"));
    assert.ok(!cardKeys.includes("dimension"));
    assert.ok(!cardKeys.includes("cid"));
  } finally {
    fetchMock.restore();
  }
});

test("discovery hot strips raw payload noise into VideoCard shape", async () => {
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/popular") {
      return jsonResponse({
        code: 0,
        data: {
          list: [
            {
              aid: 1,
              bvid: "BV1aaaaaaaaaa",
              title: "热门第一",
              pic: "//i0.hdslb.com/cover.jpg",
              duration: 89,
              owner: { mid: 100, name: "up", face: "//face.jpg" },
              stat: { view: 100, like: 50, coin: 10, favorite: 20, reply: 5, danmaku: 7, share: 3 },
              rights: { download: 0 },
              dimension: { width: 1920 },
              up_from_v2: 36,
              cover43: "ignored",
              tnamev2: "搞笑",
              his_rank: 12,
              rcmd_reason: { content: "百万播放" },
            },
          ],
          no_more: false,
        },
      });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await callTool("discovery", { action: "hot", limit: 5 }) as any;
    assert.equal(result.list.length, 1);
    const card = result.list[0];
    assert.equal(card.cover, "https://i0.hdslb.com/cover.jpg");
    assert.equal(card.category, "搞笑");
    assert.deepEqual(card.extras, { rcmd_reason: "百万播放", his_rank: 12 });
    const cardKeys = Object.keys(card);
    for (const noise of ["rights", "dimension", "up_from_v2", "cover43", "tname", "ctime", "state", "videos"]) {
      assert.ok(!cardKeys.includes(noise), `unexpected key: ${noise}`);
    }
    assert.equal(result.has_more, true);
  } finally {
    fetchMock.restore();
  }
});

test("discovery search returns VideoListResult and drops raw payload noise", async () => {
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
    if (url.pathname === "/x/web-interface/wbi/search/type") {
      return jsonResponse({
        code: 0,
        data: {
          page: 1,
          pagesize: 5,
          numResults: 1000,
          next: 2,
          seid: "ignored",
          exp_list: { foo: true, bar: true },
          pageinfo: { tv: { numResults: 0, pages: 0, total: 0 } },
          result: [
            {
              aid: 116530582917601,
              bvid: "BV1WiRhBhEmQ",
              title: "<em class=\"keyword\">Veritasium</em> 真理元素",
              arcurl: "https://www.bilibili.com/video/BV1WiRhBhEmQ",
              pic: "//i0.hdslb.com/bfs/archive/cover.jpg",
              description: "晶型危机",
              author: "Veritasium真理元素",
              mid: 94742590,
              upic: "//i1.hdslb.com/bfs/face/3e3e6ffa.jpg",
              duration: "31:34",
              senddate: 1778130000,
              play: 433574,
              like: 22302,
              review: 1990,
              favorites: 14175,
              danmaku: 1800,
              tag: "physics",
              rank_score: 1234.56,
            },
          ],
        },
      });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await callTool("discovery", {
      action: "search",
      keyword: "Veritasium",
      limit: 5,
    }) as any;
    const resultKeys = Object.keys(result);
    for (const noise of ["seid", "exp_list", "pageinfo", "rqt_type", "is_hit_web_inf", "egg_hit"]) {
      assert.ok(!resultKeys.includes(noise), `unexpected key: ${noise}`);
    }
    assert.equal(result.list.length, 1);
    assert.equal(result.page, 1);
    assert.equal(result.total, 1000);
    assert.equal(result.has_more, true);
    const card = result.list[0];
    assert.equal(card.bvid, "BV1WiRhBhEmQ");
    assert.equal(card.title, "Veritasium 真理元素");
    assert.equal(card.cover, "https://i0.hdslb.com/bfs/archive/cover.jpg");
    assert.equal(card.duration_seconds, 1894);
    assert.equal(card.duration_text, "31:34");
    assert.equal(card.owner.name, "Veritasium真理元素");
    assert.equal(card.owner.avatar, "https://i1.hdslb.com/bfs/face/3e3e6ffa.jpg");
    assert.equal(card.stat.view, 433574);
    assert.equal(card.pubdate, 1778130000);
    assert.deepEqual(card.extras, { tag: "physics", rank_score: 1234.56 });
  } finally {
    fetchMock.restore();
  }
});

test("discovery home returns shaped items from upstream feed", async () => {
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
            { goto: "av", bvid: "BV1", id: 1, cid: 1, title: "t1", pic: "p1", duraion: 60, owner: { mid: 1, name: "u1", face: "f1" }, stat: { view: 10 }, pubdate: 0, rcmd_reason: { reason_type: 1, content: "已关注" } },
          ],
        },
      });
    }
    return jsonResponse({ code: -404 });
  });
  try {
    const result: any = await callTool("discovery", { action: "home", limit: 5 });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].bvid, "BV1");
    assert.equal(result.items[0].reason, "已关注");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("discovery following requires SESSDATA and propagates cursor", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch(() => jsonResponse({ code: 0, data: {} }));
  try {
    await assert.rejects(
      callTool("discovery", { action: "following" }),
      (err: any) => err?.code === "BILIBILI_COOKIE_INVALID",
    );
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});
