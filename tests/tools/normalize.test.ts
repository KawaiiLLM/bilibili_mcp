import test from "node:test";
import assert from "node:assert/strict";
import {
  stripHtml,
  normalizeAbsoluteUrl,
  colorIntToHex,
  truncateText,
  DANMAKU_MODE_LABELS,
  normalizeVideoCard,
  type VideoCard,
  normalizeVideoList,
  type VideoListResult,
  normalizeDanmakuItem,
  type DanmakuItem,
  normalizeSubtitleEntry,
  type SubtitleEntry,
} from "../../src/tools/normalize.js";

test("stripHtml removes tags and collapses whitespace", () => {
  assert.equal(stripHtml("<em>Hello</em>  world"), "Hello world");
  assert.equal(stripHtml(undefined), "");
  assert.equal(stripHtml(null), "");
});

test("normalizeAbsoluteUrl prepends https for protocol-relative urls", () => {
  assert.equal(normalizeAbsoluteUrl("//i0.hdslb.com/cover.jpg"), "https://i0.hdslb.com/cover.jpg");
  assert.equal(normalizeAbsoluteUrl("https://x.com"), "https://x.com");
  assert.equal(normalizeAbsoluteUrl(""), "");
  assert.equal(normalizeAbsoluteUrl(undefined), "");
});

test("colorIntToHex formats integer to padded hex", () => {
  assert.equal(colorIntToHex(16777215), "#ffffff");
  assert.equal(colorIntToHex(0), "#000000");
  assert.equal(colorIntToHex(15138834), "#e70012");
});

test("truncateText cuts at max length and appends ellipsis", () => {
  assert.equal(truncateText("abcdef", 10), "abcdef");
  assert.equal(truncateText("abcdefghijkl", 6), "abcdef…");
  assert.equal(truncateText(undefined, 5), "");
});

test("DANMAKU_MODE_LABELS covers known modes", () => {
  assert.equal(DANMAKU_MODE_LABELS[1], "滚动");
  assert.equal(DANMAKU_MODE_LABELS[4], "底端");
  assert.equal(DANMAKU_MODE_LABELS[5], "顶端");
  assert.equal(DANMAKU_MODE_LABELS[6], "逆向");
  assert.equal(DANMAKU_MODE_LABELS[7], "高级");
  assert.equal(DANMAKU_MODE_LABELS[8], "代码");
  assert.equal(DANMAKU_MODE_LABELS[9], "BAS");
});

test("normalizeVideoCard maps hot endpoint payload", () => {
  const raw = {
    aid: 116546085061974,
    bvid: "BV1wPRZBMEft",
    title: "《陛下何故谋反》",
    pic: "http://i1.hdslb.com/bfs/archive/cover.jpg",
    duration: 89,
    pubdate: 1778385600,
    desc: "-",
    pub_location: "上海",
    tname: "搞笑",
    tnamev2: "语言类小剧场",
    owner: { mid: 100, name: "up", face: "//face.jpg" },
    stat: { view: 4726595, like: 303885, coin: 6133, favorite: 15864, reply: 4409, danmaku: 1505, share: 6407 },
    rights: { download: 0 },
    dimension: { width: 1080 },
    rcmd_reason: { content: "百万播放" },
    his_rank: 12,
    season_type: 1,
  };

  const card: VideoCard = normalizeVideoCard(raw, "hot");
  assert.equal(card.bvid, "BV1wPRZBMEft");
  assert.equal(card.aid, 116546085061974);
  assert.equal(card.title, "《陛下何故谋反》");
  assert.equal(card.url, "https://www.bilibili.com/video/BV1wPRZBMEft");
  assert.equal(card.cover, "http://i1.hdslb.com/bfs/archive/cover.jpg");
  assert.equal(card.duration_seconds, 89);
  assert.equal(card.duration_text, "01:29");
  assert.deepEqual(card.owner, { mid: 100, name: "up", avatar: "https://face.jpg" });
  assert.equal(card.stat.view, 4726595);
  assert.equal(card.stat.like, 303885);
  assert.equal(card.pub_location, "上海");
  assert.equal(card.category, "语言类小剧场");
  assert.equal(card.pubdate, 1778385600);
  assert.deepEqual(card.extras, { rcmd_reason: "百万播放", his_rank: 12, season_type: 1 });
  // 噪音字段不在
  const cardKeys = Object.keys(card);
  assert.ok(!cardKeys.includes("rights"));
  assert.ok(!cardKeys.includes("dimension"));
});

test("normalizeVideoCard search source strips highlight html and extracts senddate", () => {
  const raw = {
    aid: 116530582917601,
    bvid: "BV1WiRhBhEmQ",
    title: "<em class=\"keyword\">Veritasium</em> 真理元素",
    arcurl: "//www.bilibili.com/video/BV1WiRhBhEmQ",
    pic: "//i0.hdslb.com/bfs/archive/cover.jpg",
    description: "<em>药物</em>晶型危机",
    duration: "31:34",
    senddate: 1778130000,
    author: "Veritasium真理元素",
    mid: 94742590,
    upic: "//i1.hdslb.com/bfs/face/3e3e6ffa.jpg",
    play: 433574,
    like: 22302,
    review: 1990,
    favorites: 14175,
    danmaku: 1800,
    tag: "physics, chemistry",
    rank_score: 1234.56,
  };

  const card: VideoCard = normalizeVideoCard(raw, "search");
  assert.equal(card.title, "Veritasium 真理元素");
  assert.equal(card.description, "药物晶型危机");
  assert.equal(card.url, "https://www.bilibili.com/video/BV1WiRhBhEmQ");
  assert.equal(card.cover, "https://i0.hdslb.com/bfs/archive/cover.jpg");
  assert.equal(card.owner.name, "Veritasium真理元素");
  assert.equal(card.owner.avatar, "https://i1.hdslb.com/bfs/face/3e3e6ffa.jpg");
  assert.equal(card.stat.view, 433574);
  assert.equal(card.pubdate, 1778130000);
  assert.deepEqual(card.extras, { tag: "physics, chemistry", rank_score: 1234.56 });
});

test("normalizeVideoCard related source aligns with M6 shape", () => {
  const raw = {
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
  };

  const card: VideoCard = normalizeVideoCard(raw, "related");
  assert.equal(card.title, "相关 视频");
  assert.equal(card.bvid, "BV2abcdefghi");
  assert.equal(card.aid, 2);
  assert.equal(card.url, "https://www.bilibili.com/video/BV2abcdefghi");
  assert.equal(card.duration_seconds, 61);
  assert.equal(card.duration_text, "01:01");
  assert.equal(card.stat.view, 100);
  assert.equal(card.owner.avatar, "avatar.jpg");
  assert.equal(card.category, "动画");
  assert.equal(card.extras, undefined);
  const cardKeys = Object.keys(card);
  assert.ok(!cardKeys.includes("cid"), "related source must not leak cid");
});

test("normalizeVideoList unwraps payload list and applies limit", () => {
  const payload = {
    list: [
      { bvid: "BV1aaaaaaaaaa", aid: 1, title: "A", duration: 60, pubdate: 1, owner: {}, stat: {} },
      { bvid: "BV1bbbbbbbbbb", aid: 2, title: "B", duration: 90, pubdate: 2, owner: {}, stat: {} },
      { bvid: "BV1cccccccccc", aid: 3, title: "C", duration: 30, pubdate: 3, owner: {}, stat: {} },
    ],
    no_more: false,
  };
  const result: VideoListResult = normalizeVideoList(payload, "hot", { limit: 2 });
  assert.equal(result.list.length, 2);
  assert.equal(result.list[0].bvid, "BV1aaaaaaaaaa");
  assert.equal(result.has_more, true);
});

test("normalizeVideoList accepts custom arrayKey for search payload", () => {
  const payload = {
    page: 1,
    numResults: 1000,
    next: 2,
    result: [
      { bvid: "BV1xxxxxxxxxx", aid: 100, title: "search", duration: "10:00", play: 0 },
    ],
    seid: "ignored",
    exp_list: { foo: true },
    pageinfo: {},
  };
  const result: VideoListResult = normalizeVideoList(payload, "search", { arrayKey: "result", limit: 5 });
  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].bvid, "BV1xxxxxxxxxx");
  assert.equal(result.page, 1);
  assert.equal(result.has_more, true);
  assert.equal(result.total, 1000);
});

test("normalizeVideoList handles top-level array (related shape)", () => {
  const payload = [
    { bvid: "BV1aaaaaaaaaa", aid: 1, title: "first", duration: 10, owner: {}, stat: {} },
    { bvid: "BV1bbbbbbbbbb", aid: 2, title: "second", duration: 20, owner: {}, stat: {} },
  ];
  const result: VideoListResult = normalizeVideoList(payload, "related", { limit: 1 });
  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].title, "first");
});

test("normalizeVideoList respects no_more=true sentinel", () => {
  const result: VideoListResult = normalizeVideoList({ list: [], no_more: true }, "hot");
  assert.equal(result.list.length, 0);
  assert.equal(result.has_more, false);
});

test("normalizeDanmakuItem expands mode label and color hex", () => {
  const result: DanmakuItem = normalizeDanmakuItem({
    time_seconds: 1258.586,
    mode: 1,
    font_size: 25,
    color: 16777215,
    content: "test",
  });
  assert.deepEqual(result, {
    time_seconds: 1258.586,
    content: "test",
    mode: 1,
    mode_label: "滚动",
    font_size: 25,
    color: 16777215,
    color_hex: "#ffffff",
  });
});

test("normalizeDanmakuItem unknown mode falls back to '未知'", () => {
  const result: DanmakuItem = normalizeDanmakuItem({
    time_seconds: 0,
    mode: 99,
    font_size: 12,
    color: 0,
    content: "x",
  });
  assert.equal(result.mode_label, "未知");
  assert.equal(result.color_hex, "#000000");
});

test("normalizeSubtitleEntry strips internal fields and adds ai_generated", () => {
  const result: SubtitleEntry = normalizeSubtitleEntry({
    id: 2013306452378246100,
    lan: "ai-zh",
    lan_doc: "中文",
    is_lock: false,
    subtitle_url: "//aisubtitle.hdslb.com/path?auth_key=abc",
    subtitle_url_v2: "//subtitle.bilibili.com/S%13%1B%1D",
    type: 1,
    id_str: "2013306452378246144",
    ai_type: 1,
    ai_status: 2,
  });
  assert.deepEqual(result, {
    id: 2013306452378246100,
    lan: "ai-zh",
    lan_doc: "中文",
    type: 1,
    ai_generated: true,
    subtitle_url: "https://aisubtitle.hdslb.com/path?auth_key=abc",
  });
});

test("normalizeSubtitleEntry treats non-ai_type as human", () => {
  const result: SubtitleEntry = normalizeSubtitleEntry({
    id: 1,
    lan: "zh-Hans",
    lan_doc: "中文",
    type: 2,
    ai_type: 0,
    subtitle_url: "https://x.com/x.json",
  });
  assert.equal(result.ai_generated, false);
  assert.equal(result.subtitle_url, "https://x.com/x.json");
});
