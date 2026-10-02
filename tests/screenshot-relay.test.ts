import assert from "node:assert/strict";
import { test } from "node:test";
import { ScreenshotRelay, SCREENSHOT_TTL_MS, screenshotDataUrl } from "../src/lib/devices/screenshot-relay.ts";

const owner = { userId: "u1", organizationId: "o1", deviceId: "d1" };
const image = "data:image/jpeg;base64,/9j/AA==";

test("capture is scoped to requester, organization and terminal and consumed once", () => {
  const relay = new ScreenshotRelay();
  relay.begin("r1", owner);
  assert.equal(relay.publish("wrong", "o1", "r1", image), false);
  assert.equal(relay.publish("d1", "wrong", "r1", image), false);
  assert.equal(relay.publish("d1", "o1", "wrong", image), false);
  assert.deepEqual(relay.take("r1", owner), { status: "pending" });
  assert.equal(relay.publish("d1", "o1", "r1", image), true);
  assert.deepEqual(relay.take("r1", { ...owner, userId: "u2" }), { status: "expired" });
  assert.equal(relay.publish("d1", "o1", "r1", image), false);
  assert.deepEqual(relay.take("r1", owner), { status: "ready", image });
  assert.deepEqual(relay.take("r1", owner), { status: "expired" });
});

test("closing or timing out discards late capture, no screenshot history", () => {
  let now = 100;
  const relay = new ScreenshotRelay(() => now);
  relay.begin("r1", owner);
  relay.cancel("r1", { ...owner, userId: "other" });
  assert.deepEqual(relay.take("r1", owner), { status: "pending" });
  relay.cancel("r1", owner);
  assert.equal(relay.publish("d1", "o1", "r1", image), false);
  relay.begin("r2", owner);
  assert.throws(() => relay.begin("r3", owner));
  now += SCREENSHOT_TTL_MS;
  assert.equal(relay.publish("d1", "o1", "r2", image), false);
  assert.deepEqual(relay.take("r2", owner), { status: "expired" });
});

test("legacy web player can answer only a currently open device request", () => {
  const relay = new ScreenshotRelay();
  assert.equal(relay.publish("d1", "o1", undefined, image), false);
  relay.begin("r1", owner);
  assert.equal(relay.publish("d1", "o1", undefined, image), true);
  assert.deepEqual(relay.take("r1", owner), { status: "ready", image });
});

test("capture rejects HTML SVG corrupt base64 and wrong image signatures", () => {
  assert.equal(screenshotDataUrl("/9j/AA==", "image/jpeg"), image);
  assert.equal(screenshotDataUrl(image, "image/jpeg"), image);
  assert.equal(screenshotDataUrl("iVBORw0KGgo=", "image/png"), "data:image/png;base64,iVBORw0KGgo=");
  assert.equal(screenshotDataUrl("/9j/AA==", "image/png"), null);
  assert.equal(screenshotDataUrl("PGh0bWw+", "image/jpeg"), null);
  assert.equal(screenshotDataUrl("data:image/svg+xml;base64,PHN2Zz4=", "image/svg+xml"), null);
  assert.equal(screenshotDataUrl("%invalid", "image/jpeg"), null);
});
