import test from "node:test";
import assert from "node:assert/strict";
import { getSearchSuggestions, normalizeSearchItem, stripHtml } from "../../src/modules/search.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

test("search item normalization strips Bilibili highlight HTML", () => {
  assert.equal(stripHtml("<em class=\"keyword\">Bili</em> bili"), "Bili bili");
  assert.deepEqual(normalizeSearchItem({
    title: "<em>Title</em>",
    bvid: "BV1xx",
    author: "up",
    play: "123",
    description: "hello<br>world",
  }), {
    title: "Title",
    bvid: "BV1xx",
    url: "https://www.bilibili.com/video/BV1xx",
    author: "up",
    play_count: 123,
    duration: undefined,
    publish_time: 0,
    description: "helloworld",
  });
});

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
