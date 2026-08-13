import assert from "node:assert/strict";
import test from "node:test";

import {
  cycleDays,
  dueAtForClosing,
  firstUnclosedPeriod,
  nextClosingAt,
  previousClosingAt,
} from "../src/lib/billing/cycles.ts";

test("closing days use midnight in Sao Paulo", () => {
  const before = new Date("2026-08-05T02:59:59.999Z");
  const atClosing = new Date("2026-08-05T03:00:00.000Z");
  assert.equal(nextClosingAt(before, 5).toISOString(), "2026-08-05T03:00:00.000Z");
  assert.equal(nextClosingAt(atClosing, 5).toISOString(), "2026-09-05T03:00:00.000Z");
  assert.equal(previousClosingAt(atClosing, 5).toISOString(), "2026-08-05T03:00:00.000Z");
});

test("due date includes the full fifth local day after closing", () => {
  const closing = new Date("2026-08-05T03:00:00.000Z");
  assert.equal(dueAtForClosing(closing).toISOString(), "2026-08-11T02:59:59.999Z");
});

test("month lengths and February produce exact cycle days", () => {
  assert.equal(
    cycleDays(new Date("2026-02-05T03:00:00Z"), new Date("2026-03-05T03:00:00Z")),
    28,
  );
  assert.equal(
    cycleDays(new Date("2028-02-05T03:00:00Z"), new Date("2028-03-05T03:00:00Z")),
    29,
  );
  assert.equal(
    cycleDays(new Date("2026-04-20T03:00:00Z"), new Date("2026-05-20T03:00:00Z")),
    30,
  );
  assert.equal(
    cycleDays(new Date("2026-07-01T03:00:00Z"), new Date("2026-08-01T03:00:00Z")),
    31,
  );
});

test("manual activation starts a new period without historical debt", () => {
  const activation = new Date("2026-08-07T15:30:00Z");
  const period = firstUnclosedPeriod(activation, 10);
  assert.equal(period.start.toISOString(), activation.toISOString());
  assert.equal(period.end.toISOString(), "2026-08-10T03:00:00.000Z");
});

test("all supported closing days resolve correctly", () => {
  const reference = new Date("2026-08-01T03:00:00.000Z");
  assert.deepEqual(
    ([1, 5, 10, 15, 20] as const).map((day) => nextClosingAt(reference, day).getUTCDate()),
    [1, 5, 10, 15, 20],
  );
});
