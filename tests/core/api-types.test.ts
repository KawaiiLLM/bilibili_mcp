import test from "node:test";
import assert from "node:assert/strict";
import { API_FILE_NAMES, type ApiFileName } from "../../src/core/types.js";

test("ApiFileName is derived from API_FILE_NAMES", () => {
  const files: ApiFileName[] = [...API_FILE_NAMES];
  assert.deepEqual(files, ["video", "comment", "danmaku", "search", "ranking", "action", "auth", "dynamic", "space"]);
});
