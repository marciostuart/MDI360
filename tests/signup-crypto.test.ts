import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createHash, createHmac } from "node:crypto";
import {
  decryptSignupPayload,
  encryptSignupPayload,
  signupBinding,
  signupBindingCandidates,
} from "../src/lib/landing/signup-crypto.server.ts";

test("new signup requires a dedicated key even when a legacy session key exists", () => {
  const previous = process.env.SESSION_SECRET;
  const previousSignup = process.env.SIGNUP_DATA_SECRET;
  process.env.SESSION_SECRET = "123456789012345678901234";
  delete process.env.SIGNUP_DATA_SECRET;
  try {
    assert.throws(() => encryptSignupPayload({ name: "Teste" }), /SIGNUP_DATA_SECRET_INVALID/);
    assert.throws(() => signupBinding("127.0.0.1"), /SIGNUP_DATA_SECRET_INVALID/);
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
    const legacySecret = process.env.SESSION_SECRET!;
    const iv = Buffer.alloc(12, 7);
    const cipher = createCipheriv(
      "aes-256-gcm",
      createHash("sha256").update(legacySecret).digest(),
      iv,
    );
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
    const legacy = `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
    const oldBinding = createHmac("sha256", legacySecret).update("127.0.0.1").digest("hex");
    assert.deepEqual(signupBindingCandidates("127.0.0.1"), [oldBinding]);
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
