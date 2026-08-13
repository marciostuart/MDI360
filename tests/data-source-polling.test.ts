import assert from "node:assert/strict";
import test from "node:test";

import {
  lotteryRetryDelayMs,
  normalizeRefreshMinutes,
} from "../src/lib/widgets/lottery-polling.ts";

test("normalizes configurable source intervals", () => {
  assert.equal(normalizeRefreshMinutes(undefined), 30);
  assert.equal(normalizeRefreshMinutes(1), 5);
  assert.equal(normalizeRefreshMinutes(60), 60);
  assert.equal(normalizeRefreshMinutes(10_000), 1440);
});

test("backs off authentication failures for six hours", () => {
  assert.equal(lotteryRetryDelayMs("Relay HTTP 401", 5), 6 * 60 * 60_000);
  assert.equal(lotteryRetryDelayMs("CAIXA HTTP 403", 30), 6 * 60 * 60_000);
});

test("uses the configured interval for transient failures with a 15 minute minimum", () => {
  assert.equal(lotteryRetryDelayMs("Relay HTTP 500", 5), 15 * 60_000);
  assert.equal(lotteryRetryDelayMs("timeout", 60), 60 * 60_000);
});
