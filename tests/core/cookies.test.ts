import test from "node:test";
import assert from "node:assert/strict";
import { appendCookieFragment } from "../../src/core/cookies.js";

test("appendCookieFragment joins existing header and new fragment with '; '", () => {
  assert.equal(
    appendCookieFragment("SESSDATA=abc", "bili_ticket=xyz"),
    "SESSDATA=abc; bili_ticket=xyz",
  );
});

test("appendCookieFragment returns fragment when header is undefined", () => {
  assert.equal(appendCookieFragment(undefined, "opus-goback=1"), "opus-goback=1");
});

test("appendCookieFragment returns fragment when header is empty string", () => {
  assert.equal(appendCookieFragment("", "opus-goback=1"), "opus-goback=1");
});

test("appendCookieFragment returns existing header unchanged when fragment is empty", () => {
  assert.equal(appendCookieFragment("SESSDATA=abc", ""), "SESSDATA=abc");
});
