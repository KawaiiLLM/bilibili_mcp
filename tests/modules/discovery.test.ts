import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../../src/core/config.js";
import { getSearchSuggestions } from "../../src/modules/search.js";
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
