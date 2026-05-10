import test from "node:test";
import assert from "node:assert/strict";
import { locateFrame } from "../../src/modules/snapshot.js";

test("locateFrame finds nearest snapshot and sprite coordinates", () => {
  const frame = locateFrame({
    image: ["//i0.hdslb.com/bfs/videoshot/1.jpg", "//i0.hdslb.com/bfs/videoshot/1-1.jpg"],
    index: [0, 5, 10, 15, 20],
    img_x_len: 2,
    img_y_len: 2,
    img_x_size: 160,
    img_y_size: 90,
  }, 12);

  assert.deepEqual(frame, {
    imageUrl: "https://i0.hdslb.com/bfs/videoshot/1.jpg",
    frameIndex: 2,
    timestamp: 10,
    x: 0,
    y: 90,
    width: 160,
    height: 90,
  });
});
