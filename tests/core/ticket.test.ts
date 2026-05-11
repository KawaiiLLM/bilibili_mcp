import test from "node:test";
import assert from "node:assert/strict";
import { _hmacSha256ForTest, clearTicketCache, getBiliTicket } from "../../src/core/ticket.js";
import { installMockFetch, jsonResponse } from "../helpers/mock-fetch.js";

test("hmacSha256 produces stable hash for known ticket input", () => {
  // Reference: Python hmac.new(b"XgwSnGZ1p", b"ts1700000000", hashlib.sha256).hexdigest()
  const expected = "bb79f0d980ffbb51597aa1a3e8b55603025cc1322ac766f4c1a98852e6182514";
  assert.equal(_hmacSha256ForTest("XgwSnGZ1p", "ts1700000000"), expected);
});

test("getBiliTicket fetches ticket via GenWebTicket POST", async () => {
  clearTicketCache();
  let captured: { url: URL; init: RequestInit } | undefined;
  const fetchMock = installMockFetch((url, init) => {
    captured = { url, init };
    return jsonResponse({ code: 0, data: { ticket: "ticket-abc-123" } });
  });
  try {
    const ticket = await getBiliTicket();
    assert.equal(ticket, "ticket-abc-123");
    assert.equal(captured!.init.method, "POST");
    assert.equal(captured!.url.host, "api.bilibili.com");
    assert.ok(captured!.url.pathname.endsWith("/GenWebTicket"));
    assert.equal(captured!.url.searchParams.get("key_id"), "ec02");
    assert.equal(captured!.url.searchParams.get("csrf"), "");
    assert.match(captured!.url.searchParams.get("hexsign") ?? "", /^[0-9a-f]{64}$/);
    assert.match(captured!.url.searchParams.get("context[ts]") ?? "", /^\d{10}$/);
  } finally {
    fetchMock.restore();
    clearTicketCache();
  }
});

test("getBiliTicket returns cached value while not expired", async () => {
  clearTicketCache();
  let fetchCount = 0;
  const fetchMock = installMockFetch(() => {
    fetchCount += 1;
    return jsonResponse({ code: 0, data: { ticket: `t-${fetchCount}` } });
  });
  try {
    const first = await getBiliTicket();
    const second = await getBiliTicket();
    assert.equal(first, "t-1");
    assert.equal(second, "t-1");
    assert.equal(fetchCount, 1);
  } finally {
    fetchMock.restore();
    clearTicketCache();
  }
});

test("getBiliTicket dedupes concurrent calls into single fetch", async () => {
  clearTicketCache();
  let fetchCount = 0;
  const fetchMock = installMockFetch(async () => {
    fetchCount += 1;
    await new Promise((r) => setTimeout(r, 20));
    return jsonResponse({ code: 0, data: { ticket: "concurrent" } });
  });
  try {
    const tickets = await Promise.all([
      getBiliTicket(),
      getBiliTicket(),
      getBiliTicket(),
      getBiliTicket(),
    ]);
    assert.deepEqual(tickets, ["concurrent", "concurrent", "concurrent", "concurrent"]);
    assert.equal(fetchCount, 1);
    // Verify primary caller wrote to cache: a later call must hit cache, not refetch.
    assert.equal(await getBiliTicket(), "concurrent");
    assert.equal(fetchCount, 1);
  } finally {
    fetchMock.restore();
    clearTicketCache();
  }
});
