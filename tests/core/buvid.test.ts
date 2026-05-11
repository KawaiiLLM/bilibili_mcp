import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../../src/core/config.js";
import { clearBuvidCache, getBuvidCookies } from "../../src/core/buvid.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

config.enableBiliTicket = false;

test("getBuvidCookies activates after SPI and returns extended cookie bundle", async () => {
  clearBuvidCache();
  config.enableBuvidActivation = true;
  let spiCalls = 0;
  let activationCalls = 0;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/frontend/finger/spi") {
      spiCalls += 1;
      return jsonResponse({ code: 0, data: { b_3: "BUVID3-XXX", b_4: "BUVID4-YYY" } });
    }
    if (url.pathname === "/x/internal/gaia-gateway/ExClimbWuzhi") {
      activationCalls += 1;
      return jsonResponse({ code: 0, msg: "ok" });
    }
    throw new Error(`unexpected url: ${url.toString()}`);
  });
  try {
    const cookie = await getBuvidCookies();
    assert.ok(cookie, "expected cookie header to be set");
    assert.match(cookie!, /buvid3=BUVID3-XXX/);
    assert.match(cookie!, /buvid4=BUVID4-YYY/);
    assert.match(cookie!, /buvid_fp=[0-9a-f]+/);
    assert.match(cookie!, /_uuid=[1-9A-F0-]+\d{5}infoc/);
    assert.equal(spiCalls, 1);
    assert.equal(activationCalls, 1);
  } finally {
    fetchMock.restore();
    clearBuvidCache();
  }
});

test("getBuvidCookies still returns cookie when ExClimbWuzhi fails", async () => {
  clearBuvidCache();
  config.enableBuvidActivation = true;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/frontend/finger/spi") {
      return jsonResponse({ code: 0, data: { b_3: "B3", b_4: "B4" } });
    }
    if (url.pathname === "/x/internal/gaia-gateway/ExClimbWuzhi") {
      return new Response("upstream down", { status: 500 });
    }
    throw new Error("unexpected url");
  });
  try {
    const cookie = await getBuvidCookies();
    assert.ok(cookie);
    assert.match(cookie!, /buvid3=B3/);
    assert.match(cookie!, /buvid_fp=[0-9a-f]+/);
  } finally {
    fetchMock.restore();
    clearBuvidCache();
  }
});

test("getBuvidCookies skips activation when disabled but still emits buvid_fp + _uuid", async () => {
  clearBuvidCache();
  config.enableBuvidActivation = false;
  let activationHit = false;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/frontend/finger/spi") {
      return jsonResponse({ code: 0, data: { b_3: "B3", b_4: "B4" } });
    }
    if (url.pathname === "/x/internal/gaia-gateway/ExClimbWuzhi") {
      activationHit = true;
    }
    throw new Error("unexpected url");
  });
  try {
    const cookie = await getBuvidCookies();
    assert.ok(cookie);
    assert.match(cookie!, /buvid3=B3/);
    assert.match(cookie!, /buvid_fp=[0-9a-f]+/);
    assert.equal(activationHit, false);
  } finally {
    fetchMock.restore();
    clearBuvidCache();
    config.enableBuvidActivation = true;
  }
});

test("getBuvidCookies caches across calls (no extra SPI or activation)", async () => {
  clearBuvidCache();
  config.enableBuvidActivation = true;
  let spiCalls = 0;
  let activationCalls = 0;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/frontend/finger/spi") {
      spiCalls += 1;
      return jsonResponse({ code: 0, data: { b_3: "X", b_4: "Y" } });
    }
    if (url.pathname === "/x/internal/gaia-gateway/ExClimbWuzhi") {
      activationCalls += 1;
      return jsonResponse({ code: 0, msg: "ok" });
    }
    throw new Error("unexpected url");
  });
  try {
    const first = await getBuvidCookies();
    const second = await getBuvidCookies();
    assert.equal(first, second);
    assert.equal(spiCalls, 1);
    assert.equal(activationCalls, 1);
  } finally {
    fetchMock.restore();
    clearBuvidCache();
  }
});

test("getBuvidCookies dedupes concurrent first-time callers", async () => {
  clearBuvidCache();
  config.enableBuvidActivation = true;
  let spiCalls = 0;
  let activationCalls = 0;
  const fetchMock = installMockFetch(async (url) => {
    if (url.pathname === "/x/frontend/finger/spi") {
      spiCalls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return jsonResponse({ code: 0, data: { b_3: "X", b_4: "Y" } });
    }
    if (url.pathname === "/x/internal/gaia-gateway/ExClimbWuzhi") {
      activationCalls += 1;
      return jsonResponse({ code: 0 });
    }
    throw new Error("unexpected url");
  });
  try {
    const cookies = await Promise.all([getBuvidCookies(), getBuvidCookies(), getBuvidCookies()]);
    assert.equal(new Set(cookies).size, 1, "all callers should receive the same cookie");
    assert.equal(spiCalls, 1);
    assert.equal(activationCalls, 1);
  } finally {
    fetchMock.restore();
    clearBuvidCache();
  }
});
