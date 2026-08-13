import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { validateMercadoPagoWebhook } from "../src/lib/billing/mercado-pago.server.ts";

function signedRequest(dataId: string, timestamp = Date.now()) {
  const requestId = "request-test-123";
  const secret = "test-secret-never-used-in-production";
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = secret;
  const ts = String(timestamp);
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const signature = createHmac("sha256", secret).update(manifest).digest("hex");
  return new Request("https://mdi.example/api/public/mercado-pago/webhook", {
    headers: {
      "x-request-id": requestId,
      "x-signature": `ts=${ts},v1=${signature}`,
    },
  });
}

test("accepts a valid Mercado Pago webhook signature", () => {
  assert.equal(validateMercadoPagoWebhook(signedRequest("ORDER-ABC"), "ORDER-ABC"), true);
});

test("rejects a signature for a different order", () => {
  assert.equal(validateMercadoPagoWebhook(signedRequest("ORDER-ABC"), "ORDER-XYZ"), false);
});

test("rejects signatures outside the timestamp tolerance", () => {
  const old = Date.now() - 11 * 60_000;
  assert.equal(validateMercadoPagoWebhook(signedRequest("ORDER-ABC", old), "ORDER-ABC"), false);
});
