import test from "node:test";
import assert from "node:assert/strict";
import { locateFrame } from "../../src/modules/snapshot.js";
import { selectVideoStream } from "../../src/modules/snapshot.js";

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

test("selectVideoStream picks DASH stream closest to target qn with AVC preference", () => {
  const payload = {
    dash: {
      video: [
        { id: 80, codecid: 12, baseUrl: "hev-1080.m4s", width: 1920, height: 1080 },
        { id: 80, codecid: 7, baseUrl: "avc-1080.m4s", width: 1920, height: 1080 },
        { id: 64, codecid: 7, baseUrl: "avc-720.m4s", width: 1280, height: 720 },
      ],
    },
  };
  const stream = selectVideoStream(payload, 80);
  assert.equal(stream.url, "avc-1080.m4s");
  assert.equal(stream.quality, 80);
  assert.equal(stream.width, 1920);
  assert.equal(stream.height, 1080);
});

test("selectVideoStream picks closest available when exact qn not present", () => {
  const payload = {
    dash: {
      video: [
        { id: 64, codecid: 7, baseUrl: "avc-720.m4s", width: 1280, height: 720 },
        { id: 32, codecid: 7, baseUrl: "avc-480.m4s", width: 854, height: 480 },
      ],
    },
  };
  const stream = selectVideoStream(payload, 80);
  assert.equal(stream.url, "avc-720.m4s");
  assert.equal(stream.quality, 64);
});

test("selectVideoStream falls back to durl when no DASH", () => {
  const payload = { durl: [{ url: "video.mp4" }], quality: 32 };
  const stream = selectVideoStream(payload, 80);
  assert.equal(stream.url, "video.mp4");
  assert.equal(stream.quality, 32);
});

test("selectVideoStream throws when no streams available", () => {
  assert.throws(() => selectVideoStream({ dash: { video: [] } }, 80), /NO_VIDEO_STREAM/);
  assert.throws(() => selectVideoStream({}, 80), /NO_VIDEO_STREAM/);
});
