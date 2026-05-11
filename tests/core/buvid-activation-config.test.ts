import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../../src/core/config.js";

test("enableBuvidActivation defaults to true", () => {
  assert.equal(config.enableBuvidActivation, true);
});
