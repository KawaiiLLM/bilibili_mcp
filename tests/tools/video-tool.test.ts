import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../../src/core/config.js";
import { credentialManager } from "../../src/core/credential.js";
import { callTool } from "../../src/server.js";
import { normalizeAiSummaryOutput } from "../../src/tools/video-tool.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

config.enableBiliTicket = false;

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

test("video summary output keeps summary and outline but drops raw subtitle blocks", () => {
  const result = normalizeAiSummaryOutput({
    code: 0,
    stid: "summary-id",
    status: 1,
    like_num: 2,
    dislike_num: 0,
    model_result: {
      result_type: 2,
      summary: "视频摘要",
      outline: [
        {
          title: "第一段",
          timestamp: 12,
          part_outline: [
            { timestamp: 13, content: "要点 A" },
            { timestamp: 24, content: "要点 B" },
          ],
        },
      ],
      subtitle: [
        {
          part_subtitle: [
            { start_timestamp: 12, end_timestamp: 13, content: "大段字幕" },
          ],
        },
      ],
    },
  });

  assert.deepEqual(result, {
    available: true,
    code: 0,
    result_type: 2,
    stid: "summary-id",
    status: 1,
    like_count: 2,
    dislike_count: 0,
    summary: "视频摘要",
    outline: [
      {
        title: "第一段",
        timestamp: 12,
        part_outline: [
          { timestamp: 13, content: "要点 A" },
          { timestamp: 24, content: "要点 B" },
        ],
      },
    ],
  });
});

test("module calls accept RequestContext credentials", async () => {
  const { getVideoInfo } = await import("../../src/modules/video.js");
  const credential = { cookieHeader: "SESSDATA=session", cookies: [] };
  const fetchMock = installMockFetch((_url, init) => {
    const cookieHeader = (init.headers as Record<string, string>).Cookie;
    assert.match(cookieHeader ?? "", new RegExp(credential.cookieHeader.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(cookieHeader ?? "", /opus-goback=1/);
    return jsonResponse({ code: 0, data: { bvid: "BV1abcdefghi", aid: 1, cid: 11 } });
  });

  try {
    const result = await getVideoInfo({ bvid: "BV1abcdefghi" }, { credential });
    assert.equal(result.aid, 1);
  } finally {
    fetchMock.restore();
  }
});

test("video subtitle entries strip internal fields and infer ai_generated", async () => {
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const previousCookieCloud = {
    endpoint: config.cookieCloudEndpoint,
    uuid: config.cookieCloudUuid,
    password: config.cookieCloudPassword,
  };
  config.cookieCloudEndpoint = "http://stub/";
  config.cookieCloudUuid = "stub-uuid";
  config.cookieCloudPassword = "stub-password";
  const credentialState = credentialManager as unknown as { credentials: unknown; refreshPromise: unknown };
  const previousCredentials = credentialState.credentials;
  const previousRefreshPromise = credentialState.refreshPromise;
  credentialState.credentials = {
    cookieHeader: "SESSDATA=session; bili_jct=csrf-token; DedeUserID=42",
    cookies: [],
    refreshedAt: Date.now(),
    refreshAt: Date.now() + 3_600_000,
  };
  credentialState.refreshPromise = null;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/web-interface/view") {
      return jsonResponse({
        code: 0,
        data: {
          bvid: "BV1WiRhBhEmQ",
          aid: 116530582917601,
          cid: 38147394355,
          pages: [{ page: 1, cid: 38147394355, part: "P1", duration: 1894 }],
        },
      });
    }
    if (url.pathname === "/x/player/wbi/v2") {
      return jsonResponse({
        code: 0,
        data: {
          subtitle: {
            subtitles: [
              {
                id: 2013306452378246100,
                lan: "ai-zh",
                lan_doc: "中文",
                is_lock: false,
                subtitle_url: "//aisubtitle.hdslb.com/path?auth_key=abc",
                subtitle_url_v2: "//subtitle.bilibili.com/S%13%1B",
                type: 1,
                id_str: "2013306452378246144",
                ai_type: 1,
                ai_status: 2,
              },
            ],
          },
        },
      });
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
    if (url.pathname === "/x/frontend/finger/spi") {
      return jsonResponse({ code: 0, data: { b_3: "buvid3", b_4: "buvid4" } });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await callTool("bilibili_video", {
      action: "subtitle",
      input: "BV1WiRhBhEmQ",
      preferred_lang: "zh-Hans",
    }) as any;
    assert.equal(result.subtitles.length, 1);
    const entry = result.subtitles[0];
    assert.equal(entry.id, 2013306452378246100);
    assert.equal(entry.lan, "ai-zh");
    assert.equal(entry.ai_generated, true);
    assert.equal(entry.subtitle_url, "https://aisubtitle.hdslb.com/path?auth_key=abc");
    const entryKeys = Object.keys(entry);
    for (const noise of ["subtitle_url_v2", "is_lock", "id_str", "ai_type", "ai_status"]) {
      assert.ok(!entryKeys.includes(noise), `unexpected key: ${noise}`);
    }
  } finally {
    config.rateLimitMs = previousRateLimit;
    config.cookieCloudEndpoint = previousCookieCloud.endpoint;
    config.cookieCloudUuid = previousCookieCloud.uuid;
    config.cookieCloudPassword = previousCookieCloud.password;
    credentialState.credentials = previousCredentials;
    credentialState.refreshPromise = previousRefreshPromise;
    fetchMock.restore();
  }
});
