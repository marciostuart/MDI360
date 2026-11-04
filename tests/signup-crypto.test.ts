import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptSignupPayload,
  encryptSignupPayload,
  signupBinding,
  signupBindingCandidates,
} from "../src/lib/landing/signup-crypto.server.ts";

test("signup encryption accepts existing platform secret length without changing it", () => {
  const previous = process.env.SESSION_SECRET;
  const previousSignup = process.env.SIGNUP_DATA_SECRET;
  process.env.SESSION_SECRET = "123456789012345678901234";
  delete process.env.SIGNUP_DATA_SECRET;
  try {
    const payload = { email: "test@example.com", address: { city: "Belo Horizonte" } };
    assert.deepEqual(decryptSignupPayload(encryptSignupPayload(payload)), payload);
    assert.equal(signupBinding("127.0.0.1").length, 64);
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
    if (previousSignup === undefined) delete process.env.SIGNUP_DATA_SECRET;
    else process.env.SIGNUP_DATA_SECRET = previousSignup;
  }
});

test("dedicated signup key preserves legacy encrypted data and pending bindings", () => {
  const previous = process.env.SESSION_SECRET;
  const previousSignup = process.env.SIGNUP_DATA_SECRET;
  process.env.SESSION_SECRET = "123456789012345678901234";
  delete process.env.SIGNUP_DATA_SECRET;
  try {
    const payload = { name: "Teste" };
    const legacy = encryptSignupPayload(payload);
    const oldBinding = signupBinding("127.0.0.1");
    process.env.SIGNUP_DATA_SECRET =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const current = encryptSignupPayload(payload);
    assert.match(current, /^v2\./);
    assert.deepEqual(decryptSignupPayload(legacy), payload);
    assert.deepEqual(decryptSignupPayload(current), payload);
    assert.deepEqual(signupBindingCandidates("127.0.0.1"), [
      signupBinding("127.0.0.1"),
      oldBinding,
    ]);
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
    if (previousSignup === undefined) delete process.env.SIGNUP_DATA_SECRET;
    else process.env.SIGNUP_DATA_SECRET = previousSignup;
  }
});

test("dedicated signup key works without modifying an invalid existing session secret", () => {
  const previous = process.env.SESSION_SECRET;
  const previousSignup = process.env.SIGNUP_DATA_SECRET;
  process.env.SESSION_SECRET = "curto";
  process.env.SIGNUP_DATA_SECRET =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  try {
    const payload = { name: "Teste" };
    assert.deepEqual(decryptSignupPayload(encryptSignupPayload(payload)), payload);
    assert.equal(signupBindingCandidates("127.0.0.1").length, 1);
    assert.equal(process.env.SESSION_SECRET, "curto");
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
    if (previousSignup === undefined) delete process.env.SIGNUP_DATA_SECRET;
    else process.env.SIGNUP_DATA_SECRET = previousSignup;
  }
});
