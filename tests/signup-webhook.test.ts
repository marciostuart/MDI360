import test from "node:test";
import assert from "node:assert/strict";
import { webhookDestination } from "../src/lib/landing/signup-webhook.server.ts";

test("pré-cadastro bloqueia destinos internos e protocolos inseguros no webhook", async () => {
  for (const url of [
    "https://127.0.0.1/hook",
    "https://10.0.0.1/hook",
    "https://169.254.169.254/hook",
    "https://192.168.1.1/hook",
    "https://[::1]/hook",
    "http://8.8.8.8/hook",
    "https://8.8.8.8:8443/hook",
    "https://user:secret@8.8.8.8/hook",
  ])
    await assert.rejects(() => webhookDestination(url));
  assert.equal((await webhookDestination("https://8.8.8.8/hook")).address.address, "8.8.8.8");
});
