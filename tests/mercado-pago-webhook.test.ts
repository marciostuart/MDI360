import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { validateMercadoPagoWebhookSignature } from "../src/lib/billing/mercado-pago-signature.ts";

function signedRequest(dataId: string, timestamp = Date.now()) {
  const requestId = "request-test-123";
  const secret = "test-secret-never-used-in-production";
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
  assert.equal(
    validateMercadoPagoWebhookSignature(
      signedRequest("ORDER-ABC"),
      "ORDER-ABC",
      "test-secret-never-used-in-production",
    ),
    true,
  );
});

test("rejects a signature for a different order", () => {
  assert.equal(
    validateMercadoPagoWebhookSignature(
      signedRequest("ORDER-ABC"),
      "ORDER-XYZ",
      "test-secret-never-used-in-production",
    ),
    false,
  );
});

test("rejects signatures outside the timestamp tolerance", () => {
  const old = Date.now() - 11 * 60_000;
  assert.equal(
    validateMercadoPagoWebhookSignature(
      signedRequest("ORDER-ABC", old),
      "ORDER-ABC",
      "test-secret-never-used-in-production",
    ),
    false,
  );
});
