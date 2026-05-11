import test from "node:test";
import assert from "node:assert/strict";
import { clearBuvidCache } from "../../src/core/buvid.js";
import { clearWbiCache } from "../../src/core/wbi.js";
import { config } from "../../src/core/config.js";
import { BilibiliAPIError } from "../../src/core/errors.js";
import { getVideoSubtitles } from "../../src/modules/subtitle.js";
import type { Credential } from "../../src/core/types.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

config.enableBiliTicket = false;

test("subtitle checks login status when subtitle list is empty", async () => {
  clearBuvidCache();
  clearWbiCache();
  const credential: Credential = {
    cookieHeader: "SESSDATA=session; bili_jct=csrf-token; DedeUserID=42",
    cookies: [],
  };
  let playerCalled = false;
  let loginChecked = false;
  const fetchMock = installMockFetch((url) => {
    if (url.pathname === "/x/frontend/finger/spi") {
      return jsonResponse({ code: 0, data: { b_3: "buvid3", b_4: "buvid4" } });
    }
    if (url.pathname === "/x/web-interface/nav" && !playerCalled) {
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
    if (url.pathname === "/x/player/wbi/v2") {
      playerCalled = true;
      return jsonResponse({ code: 0, data: { subtitle: { subtitles: [] } } });
    }
    if (url.pathname === "/x/web-interface/nav" && playerCalled) {
      loginChecked = true;
      return jsonResponse({ code: 0, data: { isLogin: false } });
    }
    return jsonResponse({ code: -404, message: `unexpected ${url.pathname}` });
  });

  try {
    await assert.rejects(
      () => getVideoSubtitles({ bvid: "BV1abcdefghi", cid: 1 }, { credential }),
      (error) => error instanceof BilibiliAPIError && error.code === "BILIBILI_COOKIE_INVALID",
    );
    assert.equal(loginChecked, true);
  } finally {
    fetchMock.restore();
    clearBuvidCache();
    clearWbiCache();
  }
});
