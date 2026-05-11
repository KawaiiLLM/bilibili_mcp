import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../../src/core/config.js";
import { getSpaceVideos, getSpaceInfo } from "../../src/modules/space.js";
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

test("getSpaceVideos sends dm_img anti-spider params to arc/search", async () => {
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
    await getSpaceVideos({ mid: 1 });
    assert.ok(capturedUrl, "expected arc/search to be called");
    assert.equal(capturedUrl!.searchParams.get("dm_img_list"), "[]");
    assert.ok(capturedUrl!.searchParams.get("dm_img_str"));
    assert.ok(capturedUrl!.searchParams.get("dm_cover_img_str"));
    assert.ok(capturedUrl!.searchParams.get("dm_img_inter"));
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

function fullAccInfoPayload(overrides: Record<string, any> = {}): any {
  return {
    code: 0,
    data: {
      mid: 25329395,
      name: "Sacrive",
      sex: "男",
      face: "//i0.hdslb.com/face.jpg",
      face_nft: 0,
      sign: "签名",
      rank: 10000,
      level: 6,
      jointime: 0,
      moral: 0,
      silence: 0,
      is_senior_member: 1,
      birthday: "11-15",
      top_photo: "//i0.hdslb.com/banner.png",
      school: { name: null },
      tags: null,
      pendant: { pid: 0, name: "", image: "", expire: 0 },
      fans_medal: { show: false, wear: false, medal: null },
      official: { role: 0, title: "", desc: "", type: -1 },
      profession: { name: "", department: "", title: "", is_show: 0 },
      vip: { type: 0, status: 0, due_date: 0, label: { text: "" } },
      live_room: { roomStatus: 0, liveStatus: 0, roomid: 0, title: "", url: "", cover: "" },
      sys_notice: {},
      is_followed: false,
      gaia_data: { foo: "bar" },
      theme: {},
      user_honour_info: {},
      series: {},
      mcn_info: null,
      nameplate: { nid: 0 },
      coins: 0,
      ...overrides,
    },
  };
}

test("getSpaceInfo selects whitelisted fields and excludes noise", async () => {
  const fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/acc/info") return jsonResponse(fullAccInfoPayload());
    return jsonResponse({ code: -404 });
  });

  try {
    const result = await getSpaceInfo({ mid: 25329395 }) as unknown as Record<string, unknown>;
    assert.equal(result.mid, 25329395);
    assert.equal(result.name, "Sacrive");
    assert.equal(result.sex, "男");
    assert.equal(result.avatar, "https://i0.hdslb.com/face.jpg");
    assert.equal(result.banner, "https://i0.hdslb.com/banner.png");
    assert.equal(result.sign, "签名");
    assert.equal(result.level, 6);
    assert.equal(result.is_senior_member, true);
    assert.equal(result.birthday, "11-15");
    assert.equal(result.school, null);
    assert.equal(result.space_url, "https://space.bilibili.com/25329395");
    assert.equal(Object.hasOwn(result, "gaia_data"), false);
    assert.equal(Object.hasOwn(result, "theme"), false);
    assert.equal(Object.hasOwn(result, "user_honour_info"), false);
    assert.equal(Object.hasOwn(result, "rank"), false);
    assert.equal(Object.hasOwn(result, "jointime"), false);
    assert.equal(Object.hasOwn(result, "moral"), false);
    assert.equal(Object.hasOwn(result, "coins"), false);
    assert.equal(Object.hasOwn(result, "nameplate"), false);
  } finally {
    fetchMock.restore();
  }
});

test("getSpaceInfo maps official type to personal / organization / null", async () => {
  for (const [type, expected] of [
    [-1, null],
    [0, "personal"],
    [1, "organization"],
  ] as const) {
    const fetchMock = installMockFetch((url) => {
      const stub = wbiNavStubs(url);
      if (stub) return stub;
      if (url.pathname === "/x/space/wbi/acc/info") {
        return jsonResponse(fullAccInfoPayload({ official: { role: 0, title: "T", desc: "", type } }));
      }
      return jsonResponse({ code: -404 });
    });
    try {
      const result = await getSpaceInfo({ mid: 1 }) as any;
      assert.equal(result.official.type, expected);
      assert.equal(result.official.verified, expected !== null);
    } finally {
      fetchMock.restore();
    }
  }
});

test("getSpaceInfo maps vip active flag from status", async () => {
  const fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/acc/info") {
      return jsonResponse(fullAccInfoPayload({
        vip: { type: 2, status: 1, due_date: 1810000000000, label: { text: "年度大会员" } },
      }));
    }
    return jsonResponse({ code: -404 });
  });

  try {
    const result = await getSpaceInfo({ mid: 1 }) as any;
    assert.equal(result.vip.active, true);
    assert.equal(result.vip.label, "年度大会员");
    assert.equal(result.vip.due_date, 1810000000000);
  } finally {
    fetchMock.restore();
  }
});

test("getSpaceInfo maps live_room null when roomStatus=0, populated when 1", async () => {
  let fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/acc/info") return jsonResponse(fullAccInfoPayload());
    return jsonResponse({ code: -404 });
  });
  try {
    const result = await getSpaceInfo({ mid: 1 }) as any;
    assert.equal(result.live_room, null);
  } finally {
    fetchMock.restore();
  }

  fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/acc/info") {
      return jsonResponse(fullAccInfoPayload({
        live_room: {
          roomStatus: 1, liveStatus: 1, roomid: 12345,
          title: "直播标题", url: "https://live.bilibili.com/12345",
          cover: "//i0.hdslb.com/live-cover.jpg",
        },
      }));
    }
    return jsonResponse({ code: -404 });
  });
  try {
    const result = await getSpaceInfo({ mid: 1 }) as any;
    assert.deepEqual(result.live_room, {
      roomid: 12345,
      is_live: true,
      title: "直播标题",
      cover: "https://i0.hdslb.com/live-cover.jpg",
      url: "https://live.bilibili.com/12345",
    });
  } finally {
    fetchMock.restore();
  }
});

test("getSpaceInfo maps profession only when is_show === 1", async () => {
  let fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/acc/info") return jsonResponse(fullAccInfoPayload());
    return jsonResponse({ code: -404 });
  });
  try {
    const result = await getSpaceInfo({ mid: 1 }) as any;
    assert.equal(result.profession, null);
  } finally {
    fetchMock.restore();
  }

  fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/acc/info") {
      return jsonResponse(fullAccInfoPayload({
        profession: { name: "主治医师", department: "心内科", title: "XX医院", is_show: 1 },
      }));
    }
    return jsonResponse({ code: -404 });
  });
  try {
    const result = await getSpaceInfo({ mid: 1 }) as any;
    assert.deepEqual(result.profession, { name: "主治医师", department: "心内科", title: "XX医院" });
  } finally {
    fetchMock.restore();
  }
});

test("getSpaceInfo filters and shapes tags array, null when missing or empty", async () => {
  const cases: Array<[unknown, string[] | null]> = [
    [null, null],
    [[], null],
    [["A", "", "B"], ["A", "B"]],
  ];
  for (const [tags, expected] of cases) {
    const fetchMock = installMockFetch((url) => {
      const stub = wbiNavStubs(url);
      if (stub) return stub;
      if (url.pathname === "/x/space/wbi/acc/info") return jsonResponse(fullAccInfoPayload({ tags }));
      return jsonResponse({ code: -404 });
    });
    try {
      const result = await getSpaceInfo({ mid: 1 }) as any;
      assert.deepEqual(result.tags, expected);
    } finally {
      fetchMock.restore();
    }
  }
});

test("getSpaceInfo maps fans_medal from medal subfield", async () => {
  const fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/acc/info") {
      return jsonResponse(fullAccInfoPayload({
        fans_medal: {
          show: true, wear: true,
          medal: { uid: 1, target_id: 12345, medal_id: 99, level: 20, medal_name: "魔法" },
        },
      }));
    }
    return jsonResponse({ code: -404 });
  });

  try {
    const result = await getSpaceInfo({ mid: 1 }) as any;
    assert.deepEqual(result.fans_medal, { name: "魔法", level: 20, target_mid: 12345 });
  } finally {
    fetchMock.restore();
  }
});

test("getSpaceInfo returns sys_notice content or null", async () => {
  let fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/acc/info") return jsonResponse(fullAccInfoPayload());
    return jsonResponse({ code: -404 });
  });
  try {
    const result = await getSpaceInfo({ mid: 1 }) as any;
    assert.equal(result.sys_notice, null);
  } finally {
    fetchMock.restore();
  }

  fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/acc/info") {
      return jsonResponse(fullAccInfoPayload({
        sys_notice: { id: 5, content: "该用户存在争议行为，已冻结其帐号功能的使用", notice_type: 1 },
      }));
    }
    return jsonResponse({ code: -404 });
  });
  try {
    const result = await getSpaceInfo({ mid: 1 }) as any;
    assert.equal(result.sys_notice, "该用户存在争议行为，已冻结其帐号功能的使用");
  } finally {
    fetchMock.restore();
  }
});

test("getSpaceInfo returns pendant name only when non-empty", async () => {
  let fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/acc/info") return jsonResponse(fullAccInfoPayload());
    return jsonResponse({ code: -404 });
  });
  try {
    const result = await getSpaceInfo({ mid: 1 }) as any;
    assert.equal(result.pendant, null);
  } finally {
    fetchMock.restore();
  }

  fetchMock = installMockFetch((url) => {
    const stub = wbiNavStubs(url);
    if (stub) return stub;
    if (url.pathname === "/x/space/wbi/acc/info") {
      return jsonResponse(fullAccInfoPayload({ pendant: { pid: 1, name: "夏日祭", image: "x" } }));
    }
    return jsonResponse({ code: -404 });
  });
  try {
    const result = await getSpaceInfo({ mid: 1 }) as any;
    assert.equal(result.pendant, "夏日祭");
  } finally {
    fetchMock.restore();
  }
});
