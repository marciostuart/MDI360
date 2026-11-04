import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptSignupPayload,
  encryptSignupPayload,
  signupBinding,
} from "../src/lib/landing/signup-crypto.server.ts";

test("signup encryption accepts existing platform secret length without changing it", () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "123456789012345678901234";
  try {
    const payload = { email: "test@example.com", address: { city: "Belo Horizonte" } };
    assert.deepEqual(decryptSignupPayload(encryptSignupPayload(payload)), payload);
    assert.equal(signupBinding("127.0.0.1").length, 64);
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});
