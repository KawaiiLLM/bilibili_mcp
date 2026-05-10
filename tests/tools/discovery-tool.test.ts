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
    });

    assert.deepEqual(result, {
      bvid: "BV1abcdefghi",
      aid: 1,
      related: [
        {
          title: "相关 视频",
          bvid: "BV2abcdefghi",
          aid: 2,
          cid: 22,
          url: "https://www.bilibili.com/video/BV2abcdefghi",
          cover: "http://i0.hdslb.com/cover.jpg",
          owner: { mid: 42, name: "UP", avatar: "avatar.jpg" },
          stat: { view: 100, danmaku: 2, reply: 3, favorite: 4, coin: 5, share: 6, like: 7 },
          duration_seconds: 61,
          duration_text: "01:01",
          description: "推荐说明",
          category: "动画",
        },
      ],
    });
  } finally {
    fetchMock.restore();
  }
});
