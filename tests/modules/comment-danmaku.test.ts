import test from "node:test";
import assert from "node:assert/strict";
import { buildPaginationStr, normalizeComment, parseNextCursor } from "../../src/modules/comment.js";
import { parseDanmakuXml } from "../../src/modules/danmaku.js";

test("comments use pagination_str cursor format and parse next cursor", () => {
  assert.equal(buildPaginationStr("offset-1"), "{\"offset\":\"offset-1\"}");
  assert.equal(buildPaginationStr(), undefined);
  assert.equal(parseNextCursor({ cursor: { pagination_reply: { next_offset: "offset-2" } } }), "offset-2");
  assert.equal(parseNextCursor({ cursor: { pagination_reply: {} } }), null);
});

test("comments expose rpid for replies and normalize reply count", () => {
  const comment = normalizeComment({
    rpid: 123,
    content: { message: "hello" },
    member: { mid: "42", uname: "tester", avatar: "avatar.png" },
    like: "9",
    ctime: "10",
    rcount: "2",
  });

  assert.equal(comment.rpid, 123);
  assert.equal(comment.content, "hello");
  assert.equal(comment.author.name, "tester");
  assert.equal(comment.reply_count, 2);
});

test("danmaku XML parser decodes entities and applies limit", () => {
  const parsed = parseDanmakuXml(
    '<i><d p="1.5,1,25,16777215,0,0,0,0">A&amp;B</d><d p="2,4,18,255,0,0,0,0">C&lt;D</d></i>',
    1,
  );

  assert.equal(parsed.total, 2);
  assert.equal(parsed.returned, 1);
  assert.equal(parsed.truncated, true);
  assert.equal(parsed.items[0].time_seconds, 1.5);
  assert.equal(parsed.items[0].content, "A&B");
});
