import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("queue sound controls remain visible with their existing handlers", () => {
  const source = readFileSync(
    new URL("../src/components/queue/queue-addon-manager.tsx", import.meta.url),
    "utf8",
  );
  const start = source.indexOf('<p className="text-sm font-medium">Som da chamada</p>');
  assert.ok(start > 0);
  const wrapper = source.slice(source.lastIndexOf("<div", start), start);
  assert.match(wrapper, /className="w-full space-y-4 rounded-lg border p-4"/);
  const soundControls = source.slice(start, source.indexOf("<QueueLayoutEditor", start));
  assert.match(soundControls, /value=\{form\.chimeVolume\}/);
  assert.match(soundControls, /value=\{form\.voiceVolume\}/);
  assert.match(soundControls, /uploadChime\(panel\.deviceId, file\)/);
  assert.match(soundControls, /clearChimeMutation\.mutate\(panel\.deviceId\)/);
});
