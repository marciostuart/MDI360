import assert from "node:assert/strict";
import test from "node:test";

import {
  notifyQueuePanel,
  queueRevisionFor,
  waitForQueueChange,
} from "../src/lib/player/realtime.server.ts";

test("queue operator long poll is released as soon as its panel changes", async () => {
  const panelId = `panel-${Date.now()}-${Math.random()}`;
  const initial = queueRevisionFor(panelId);
  const waiting = waitForQueueChange(panelId, initial, 1_000);

  notifyQueuePanel(panelId);

  const revision = await waiting;
  assert.ok(revision > initial);
  assert.equal(revision, queueRevisionFor(panelId));
});
