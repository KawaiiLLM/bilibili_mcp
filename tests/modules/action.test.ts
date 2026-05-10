import test from "node:test";
import assert from "node:assert/strict";
import { chooseDefaultFavoriteFolder } from "../../src/modules/action.js";

test("favorite folder fallback prefers attr default bit before title and id", () => {
  const selected = chooseDefaultFavoriteFolder([
    { id: 1, title: "默认收藏夹", attr: 2 },
    { id: 9, title: "其他收藏夹", attr: 0 },
    { id: 3, title: "默认收藏夹", attr: 2 },
  ]);

  assert.equal(selected?.id, 9);
});

test("favorite folder fallback uses title then smallest id", () => {
  const selectedByTitle = chooseDefaultFavoriteFolder([
    { id: 4, title: "稍后看", attr: 2 },
    { id: 7, title: "默认收藏夹", attr: 2 },
  ]);
  assert.equal(selectedByTitle?.id, 7);

  const selectedById = chooseDefaultFavoriteFolder([
    { id: 10, title: "A", attr: 2 },
    { id: 5, title: "B", attr: 2 },
  ]);
  assert.equal(selectedById?.id, 5);
});
