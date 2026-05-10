import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../../src/core/config.js";
import { logger } from "../../src/core/logger.js";

test("logger suppresses messages below configured level", () => {
  const previousLevel = config.logLevel;
  const previousError = console.error;
  const logs: string[] = [];
  config.logLevel = "error";
  console.error = (message?: unknown) => {
    logs.push(String(message));
  };

  try {
    logger.info("hidden");
    logger.error("visible");
    assert.equal(logs.length, 1);
    assert.match(logs[0], /"level":"error"/);
  } finally {
    config.logLevel = previousLevel;
    console.error = previousError;
  }
});
