import test from "node:test";
import assert from "node:assert/strict";
import { checkLoginStatus } from "../../src/modules/auth.js";
import type { Credential } from "../../src/core/types.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

test("checkLoginStatus verifies login through nav endpoint with credential", async () => {
  const credential: Credential = {
    cookieHeader: "SESSDATA=session; bili_jct=csrf-token; DedeUserID=42",
    cookies: [],
  };
  const fetchMock = installMockFetch((_url, init) => {
    assert.equal((init.headers as Record<string, string>).Cookie, credential.cookieHeader);
    return jsonResponse({ code: 0, data: { isLogin: true, uname: "tester", mid: 42 } });
  });

  try {
    const status = await checkLoginStatus({ credential });
    assert.equal(status.isLogin, true);
    assert.equal(status.mid, 42);
    assert.equal(status.uname, "tester");
  } finally {
    fetchMock.restore();
  }
});
