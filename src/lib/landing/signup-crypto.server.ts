import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

function secret() {
  const value = process.env.SESSION_SECRET ?? "";
  if (value.length < 32) throw new Error("SESSION_SECRET_INVALID");
  return value;
}
export function signupDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function signupBinding(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}
export function encryptSignupPayload(value: unknown) {
  const key = createHash("sha256").update(secret()).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}
export function decryptSignupPayload(value: string) {
  const [iv, tag, data] = value.split(".");
  if (!iv || !tag || !data) throw new Error("INVALID_ENCRYPTED_SIGNUP");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    createHash("sha256").update(secret()).digest(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString(),
  );
}
