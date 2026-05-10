import test from "node:test";
import assert from "node:assert/strict";
import { callTool } from "../../src/server.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

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
    const result = await callTool("bilibili_discovery", {
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
    const result = await callTool("bilibili_discovery", { action: "hot", limit: 5 }) as any;
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
