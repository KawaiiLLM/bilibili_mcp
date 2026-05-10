import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../../src/core/config.js";
import { callTool } from "../../src/server.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

test("video resolver falls back from failed BV lookup to search result", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/view" && url.searchParams.get("bvid") === "BV1abcdefghi") {
      return jsonResponse({ code: -400, message: "invalid bvid" });
    }
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
      return jsonResponse({ code: 0, data: { result: [{ bvid: "BV2abcdefghi", title: "fallback" }] } });
    }
    if (url.pathname === "/x/web-interface/view" && url.searchParams.get("bvid") === "BV2abcdefghi") {
      return jsonResponse({
        code: 0,
        data: {
          bvid: "BV2abcdefghi",
          aid: 2,
          title: "fallback video",
          cid: 22,
          pages: [{ page: 1, cid: 22, part: "P1", duration: 10 }],
        },
      });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await callTool("bilibili_video", { action: "info", input: "BV1abcdefghi" }) as any;
    assert.equal(result.bvid, "BV2abcdefghi");
    assert.equal(result.title, "fallback video");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("video snapshot action returns located frame for timestamp", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/view") {
      return jsonResponse({
        code: 0,
        data: {
          bvid: "BV1abcdefghi",
          aid: 1,
          cid: 11,
          pages: [{ page: 1, cid: 11, part: "P1", duration: 20 }],
        },
      });
    }
    if (url.pathname === "/x/player/videoshot") {
      return jsonResponse({
        code: 0,
        data: {
          image: ["//i0.hdslb.com/bfs/videoshot/1.jpg"],
          index: [0, 8, 14],
          img_x_len: 2,
          img_y_len: 2,
          img_x_size: 160,
          img_y_size: 90,
        },
      });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await callTool("bilibili_video", {
      action: "snapshot",
      input: "BV1abcdefghi",
      timestamp: 9,
    }) as any;
    assert.equal(result.frame.timestamp, 8);
    assert.equal(result.frame.imageUrl, "https://i0.hdslb.com/bfs/videoshot/1.jpg");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("module calls accept RequestContext credentials", async () => {
  const { getVideoInfo } = await import("../../src/modules/video.js");
  const credential = { cookieHeader: "SESSDATA=session", cookies: [] };
  const fetchMock = installMockFetch((_url, init) => {
    assert.equal((init.headers as Record<string, string>).Cookie, credential.cookieHeader);
    return jsonResponse({ code: 0, data: { bvid: "BV1abcdefghi", aid: 1, cid: 11 } });
  });

  try {
    const result = await getVideoInfo({ bvid: "BV1abcdefghi" }, { credential });
    assert.equal(result.aid, 1);
  } finally {
    fetchMock.restore();
  }
});
