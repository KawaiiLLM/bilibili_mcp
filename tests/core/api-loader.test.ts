import test from "node:test";
import assert from "node:assert/strict";
import { getEndpoint, listApiFiles } from "../../src/core/api-loader.js";

test("api catalog exposes required files and endpoint metadata", () => {
  assert.deepEqual(
    listApiFiles().sort(),
    ["action", "auth", "comment", "danmaku", "ranking", "search", "video"],
  );

  const playerInfo = getEndpoint("video", "info", "get_player_info");
  assert.equal(playerInfo.wbi, true);
  assert.equal(playerInfo.wbi2, true);
  assert.equal(playerInfo.auth, true);
  assert.equal(playerInfo.buvid, true);
  assert.equal(playerInfo.params_type, "query");
  assert.equal(playerInfo.response_type, "json");

  const playurl = getEndpoint("video", "info", "get_playurl");
  assert.equal(playurl.defaults?.fnval, 16);

  const favorite = getEndpoint("action", "video", "favorite");
  assert.equal(favorite.method, "POST");
  assert.equal(favorite.csrf, true);
  assert.equal(favorite.content_type, "form");
  assert.equal(favorite.defaults?.type, 2);

  const ranking = getEndpoint("ranking", "popular", "ranking");
  assert.equal(ranking.wbi, true);
  assert.equal(ranking.defaults?.web_location, "333.934");
});

test("auth catalog documents ticket and buvid infrastructure endpoints", () => {
  const ticket = getEndpoint("auth", "ticket", "get_web_ticket");
  assert.equal(ticket.method, "POST");
  assert.ok(ticket.url.endsWith("/GenWebTicket"));

  const spi = getEndpoint("auth", "buvid", "spi");
  assert.equal(spi.method, "GET");
  assert.ok(spi.url.endsWith("/x/frontend/finger/spi"));

  const activate = getEndpoint("auth", "buvid", "active_buvid");
  assert.equal(activate.method, "POST");
  assert.equal(activate.content_type, "json");
  assert.ok(activate.url.endsWith("/ExClimbWuzhi"));
});
