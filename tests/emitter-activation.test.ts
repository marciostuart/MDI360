import test from "node:test";
import assert from "node:assert/strict";
import { EMITTER_TOKEN_KEY, startEmitterActivation } from "../src/lib/queue/emitter-activation.ts";

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const json = (data: unknown, status = 200) => Response.json(data, { status });
function harness(responses: Array<Response | Error>, initial: Record<string, string> = {}, failStorage = false) {
  const stored = new Map(Object.entries(initial));
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const shown: Array<string | null> = [];
  const linked: string[] = [];
  const timers: Array<{ run: () => void; cancelled: boolean; delay: number }> = [];
  const stop = startEmitterActivation({
    fetch: (async (url, init) => {
      requests.push({ url: String(url), init });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      if (!response) throw new Error("unexpected request");
      return response;
    }) as typeof fetch,
    storage: {
      getItem: (key) => { if (failStorage) throw new Error("disabled"); return stored.get(key) ?? null; },
      setItem: (key, value) => { if (failStorage) throw new Error("disabled"); stored.set(key, value); },
      removeItem: (key) => { stored.delete(key); },
    },
    schedule: (run, delay) => {
      const timer = { run, cancelled: false, delay }; timers.push(timer);
      return () => { timer.cancelled = true; };
    },
    onState: (code) => shown.push(code), onLinked: (token) => linked.push(token),
  });
  return { requests, shown, linked, stored, stop, tick: async () => {
    const timer = timers.shift(); assert.ok(timer); if (!timer.cancelled) timer.run(); await settle();
  } };
}
test("pending polls retain one identity and one code", async () => {
  const h = harness([json({ emitterToken: "terminal-token", pairingCode: "ABC123" }),
    ...Array.from({ length: 5 }, () => json({ state: "waiting", pairingCode: "ABC123" }))]);
  await settle(); for (let i = 0; i < 5; i++) await h.tick();
  assert.equal(h.requests.filter((r) => r.url.endsWith("register")).length, 1);
  assert.deepEqual(h.shown.filter(Boolean), Array(6).fill("ABC123")); h.stop();
});
test("network, proxy HTML 404 and unstructured 410 do not rotate the code", async () => {
  const h = harness([new Error("offline"), new Response("proxy unavailable", { status: 404 }),
    json({ error: "proxy" }, 410), json({ state: "waiting", pairingCode: "ABC123" })],
    { [EMITTER_TOKEN_KEY]: "terminal-token", "mdi360.emitterPairingCode": "ABC123" });
  await settle(); for (let i = 0; i < 3; i++) await h.tick();
  assert.equal(h.requests.some((r) => r.url.endsWith("register")), false);
  assert.ok(h.shown.every((code) => code === "ABC123")); h.stop();
});
test("disabled browser storage still preserves the in-memory terminal", async () => {
  const h = harness([json({ emitterToken: "terminal-token", pairingCode: "ABC123" }),
    json({ state: "waiting", pairingCode: "ABC123" })], {}, true);
  await settle(); await h.tick();
  assert.equal(h.requests.filter((r) => r.url.endsWith("register")).length, 1);
  assert.equal(new Headers(h.requests[1].init?.headers).get("authorization"), "Bearer terminal-token"); h.stop();
});
test("only explicit expiry renews the identity", async () => {
  const h = harness([json({ code: "EMITTER_EXPIRED" }, 410),
    json({ emitterToken: "new-token", pairingCode: "NEW123" })], { [EMITTER_TOKEN_KEY]: "old-token" });
  await settle(); await h.tick();
  assert.equal(h.stored.get(EMITTER_TOKEN_KEY), "new-token");
  assert.equal(h.shown.at(-1), "NEW123"); h.stop();
});
test("linked status navigates once using the saved identity", async () => {
  const h = harness([json({ state: "linked" })], { [EMITTER_TOKEN_KEY]: "saved-token" });
  await settle(); assert.deepEqual(h.linked, ["saved-token"]); assert.equal(h.requests.length, 1); h.stop();
});
test("unmount cancels scheduled polling and every request bypasses caches", async () => {
  const h = harness([json({ state: "waiting", pairingCode: "ABC123" })], { [EMITTER_TOKEN_KEY]: "saved-token" });
  await settle(); h.stop(); await h.tick();
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].init?.cache, "no-store");
});
