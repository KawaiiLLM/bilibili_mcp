import test from "node:test";
import assert from "node:assert/strict";
import { locateFrame } from "../../src/modules/snapshot.js";
import { selectVideoStream } from "../../src/modules/snapshot.js";
import { extractFrame } from "../../src/modules/snapshot.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";
import { config } from "../../src/core/config.js";

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

test("extractFrame orchestrates getPlayUrl → selectVideoStream → ffmpeg runner", async () => {
  config.enableBiliTicket = false;
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  const fetchMock = installMockFetch((url) => {
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
          dash: {
            video: [
              { id: 80, codecid: 7, baseUrl: "https://cdn.example/avc-1080.m4s", width: 1920, height: 1080 },
            ],
          },
        },
      });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  const calls: any[] = [];
  const fakeRunner = async (args: { url: string; timestamp: number; outpath: string; headers?: Record<string, string> }) => {
    calls.push(args);
  };

  try {
    const result = await extractFrame({
      bvid: "BV1abcdefghi",
      cid: 11,
      timestamp: 30,
    }, { runner: fakeRunner });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://cdn.example/avc-1080.m4s");
    assert.equal(calls[0].timestamp, 30);
    assert.match(calls[0].outpath, /bilibili-snapshot-BV1abcdefghi.*\.jpg$/);
    assert.equal(result.timestamp, 30);
    assert.equal(result.width, 1920);
    assert.equal(result.height, 1080);
    assert.equal(result.quality, 80);
    assert.equal(result.quality_desc, "1080P 高清");
    assert.equal(result.file, calls[0].outpath);
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});

test("extractFrame uses try_look when no SESSDATA in context", async () => {
  config.enableBiliTicket = false;
  const previousRateLimit = config.rateLimitMs;
  config.rateLimitMs = 0;
  let capturedPlayurlParams: URLSearchParams | undefined;
  const fetchMock = installMockFetch((url) => {
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
      capturedPlayurlParams = url.searchParams;
      return jsonResponse({
        code: 0,
        data: {
          dash: { video: [{ id: 64, codecid: 7, baseUrl: "https://cdn.example/720.m4s", width: 1280, height: 720 }] },
        },
      });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  const fakeRunner = async () => {};

  try {
    await extractFrame({ bvid: "BV1abcdefghi", cid: 11, timestamp: 5 }, { runner: fakeRunner });
    assert.ok(capturedPlayurlParams);
    assert.equal(capturedPlayurlParams!.get("try_look"), "1");
    assert.equal(capturedPlayurlParams!.get("platform"), "html5");
  } finally {
    config.rateLimitMs = previousRateLimit;
    fetchMock.restore();
  }
});
