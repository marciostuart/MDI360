import assert from "node:assert/strict";
import test from "node:test";

import { selectLotteryLayout } from "../src/lib/widgets/lottery-layout.ts";

test("keeps lottery layouts independent for each modality", () => {
  const mega = { result: { x: 10, size: 8 } };
  const federal = { result: { x: 52, size: 3 } };
  const layouts = { megasena: mega, federal };

  assert.equal(selectLotteryLayout("megasena", layouts)?.result.x, 10);
  assert.equal(selectLotteryLayout("megasena", layouts)?.result.size, 8);
  assert.equal(selectLotteryLayout("federal", layouts)?.result.x, 52);
  assert.equal(selectLotteryLayout("federal", layouts)?.result.size, 3);
});

test("uses the legacy shared layout until a modality receives its own template", () => {
  const legacy = { result: { y: 41, size: 4 } };
  const federal = { result: { y: 18, size: 3 } };

  assert.equal(selectLotteryLayout("quina", { federal }, legacy)?.result.y, 41);
  assert.equal(selectLotteryLayout("federal", { federal }, legacy)?.result.y, 18);
});
