import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { signSignupPayload } from "../src/lib/landing/signup-webhook.server.ts";

test("signup HMAC signs the exact JSON body using the CRM 360 protocol", () => {
  const body = JSON.stringify({ nome: "Teste", email: "teste@example.com" });
  const timestamp = "1700000000";
  const nonce = "nonce-123";
  const secret = "secret-test-only";
  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex")}`;
  assert.equal(signSignupPayload(body, timestamp, nonce, secret), expected);
  assert.notEqual(signSignupPayload(`${body} `, timestamp, nonce, secret), expected);
});
