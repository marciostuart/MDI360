import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_DEVICE_SESSION_ID_LENGTH,
  normalizeDeviceSessionId,
} from "../src/lib/billing/device-session.ts";

test("normaliza um Device ID válido do Mercado Pago", () => {
  assert.equal(normalizeDeviceSessionId("  device-id_123  "), "device-id_123");
});

test("omite Device ID inválido sem bloquear o pagamento", () => {
  assert.equal(normalizeDeviceSessionId(""), undefined);
  assert.equal(normalizeDeviceSessionId("x".repeat(MAX_DEVICE_SESSION_ID_LENGTH + 1)), undefined);
  assert.equal(normalizeDeviceSessionId("device\nheader"), undefined);
  assert.equal(normalizeDeviceSessionId({ id: "device" }), undefined);
});
