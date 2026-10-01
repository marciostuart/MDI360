import test from "node:test";
import assert from "node:assert/strict";
import { playbackReportSchema, playbackEventValues, isPlaybackTimeValid } from "../src/lib/player/playback-report.ts";

const eventId = "514bd8b8-50a1-4e1f-8bff-4646346dc4a1";
const device = { id: "terminal", organizationId: "company" };
const date = new Date("2026-10-01T12:16:55.000Z");
test("native start, completion and retries retain the same event ID and original timestamp", () => {
  const start = playbackEventValues(playbackReportSchema.parse({ eventId, startedAt: date.toISOString(), completed: false }), device, date);
  const finish = playbackEventValues(playbackReportSchema.parse({ eventId, startedAt: date.toISOString(), durationMs: 30_000, completed: true }), device, date);
  assert.equal(start.id, finish.id); assert.equal(start.startedAt, finish.startedAt);
  assert.equal(start.completed, false); assert.equal(start.durationMs, 0);
  assert.equal(finish.durationMs, 30_000); assert.equal(finish.completed, true);
});
test("legacy browser and Roku reports remain completed by default", () => {
  const row = playbackEventValues(playbackReportSchema.parse({ durationMs: 8000 }), device, date);
  assert.equal(row.completed, true); assert.equal(row.durationMs, 8000); assert.equal("id" in row, false);
});
test("offline timestamps are preserved but corrupted clocks are rejected", () => {
  assert.equal(isPlaybackTimeValid(date, date.getTime() + 3 * 3600_000), true);
  assert.equal(isPlaybackTimeValid(date, date.getTime() - 6 * 60_000), false);
  assert.equal(isPlaybackTimeValid(date, date.getTime() + 32 * 24 * 3600_000), false);
  assert.equal(isPlaybackTimeValid(new Date("invalid"), date.getTime()), false);
});
test("invalid media IDs and invalid durations cannot enter the event table", () => {
  assert.equal(playbackReportSchema.safeParse({ mediaAssetId: "null" }).success, false);
  assert.equal(playbackReportSchema.safeParse({ eventId: "wrong" }).success, false);
  assert.equal(playbackReportSchema.safeParse({ durationMs: -1 }).success, false);
});
