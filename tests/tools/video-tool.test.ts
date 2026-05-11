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

test("video snapshot returns sprite metadata when no timestamp provided", async () => {
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
      // info action calls playurl for available_qualities
      return jsonResponse({ code: 0, data: { support_formats: [] } });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await callTool("bilibili_video", { action: "snapshot", input: "BV1abcdefghi" }) as any;
    assert.ok(Array.isArray(result.image));
    assert.ok(Array.isArray(result.index));
    assert.ok(!("file" in result), "no timestamp ⇒ no extracted file");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("video snapshot extracts frame when timestamp provided", async () => {
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
          pages: [{ page: 1, cid: 11, part: "P1", duration: 120 }],
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
    if (url.pathname === "/x/player/wbi/playurl") {
      return jsonResponse({
        code: 0,
        data: {
          dash: { video: [{ id: 80, codecid: 7, baseUrl: "https://cdn.example/avc-1080.m4s", width: 1920, height: 1080 }] },
        },
      });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  const { setFrameRunnerForTest } = await import("../../src/modules/snapshot.js");
  const restore = setFrameRunnerForTest(async () => {});

  try {
    const result = await callTool("bilibili_video", {
      action: "snapshot",
      input: "BV1abcdefghi",
      timestamp: 60,
    }) as any;
    assert.equal(result.timestamp, 60);
    assert.equal(result.quality, 80);
    assert.equal(result.quality_desc, "1080P 高清");
    assert.equal(result.width, 1920);
    assert.equal(result.height, 1080);
    assert.match(result.file, /bilibili-snapshot-BV1abcdefghi-p1-60s\.jpg$/);
  } finally {
    restore();
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

test("video info return includes url and available_qualities from playurl support_formats", async () => {
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
          title: "test",
          pages: [{ page: 1, cid: 11, part: "P1", duration: 20 }],
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
    if (url.pathname === "/x/player/wbi/playurl") {
      return jsonResponse({
        code: 0,
        data: {
          support_formats: [
            { quality: 120, new_description: "4K 超清", format: "hdflv2" },
            { quality: 80, new_description: "1080P 高清", format: "flv" },
            { quality: 64, new_description: "720P 高清", format: "flv720" },
            { quality: 32, new_description: "480P 清晰", format: "flv480" },
          ],
        },
      });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await callTool("bilibili_video", { action: "info", input: "BV1abcdefghi" }) as any;
    assert.equal(result.url, "https://www.bilibili.com/video/BV1abcdefghi");
    assert.ok(Array.isArray(result.available_qualities), "available_qualities should be an array");
    assert.deepEqual(result.available_qualities, [
      { qn: 120, desc: "4K 超清", need_login: true, need_vip: true },
      { qn: 80, desc: "1080P 高清", need_login: true, need_vip: false },
      { qn: 64, desc: "720P 高清", need_login: true, need_vip: false },
      { qn: 32, desc: "480P 清晰", need_login: false, need_vip: false },
    ]);
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("video info omits available_qualities silently when playurl fails", async () => {
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
          title: "test",
          pages: [{ page: 1, cid: 11, part: "P1", duration: 20 }],
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
    if (url.pathname === "/x/player/wbi/playurl") {
      return jsonResponse({ code: -404, message: "playurl unavailable" });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    const result = await callTool("bilibili_video", { action: "info", input: "BV1abcdefghi" }) as any;
    assert.equal(result.url, "https://www.bilibili.com/video/BV1abcdefghi");
    assert.ok(!("available_qualities" in result), "available_qualities should be omitted on failure");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});
