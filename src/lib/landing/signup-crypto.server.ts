import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

function legacySecret() {
  const value = process.env.SESSION_SECRET ?? "";
  if (value.length < 24) throw new Error("SESSION_SECRET_INVALID");
  return value;
}
function dedicatedSecret() {
  const value = process.env.SIGNUP_DATA_SECRET ?? "";
  if (value.length < 32) throw new Error("SIGNUP_DATA_SECRET_INVALID");
  return value;
}
function binding(value: string, dedicated: boolean) {
  if (dedicated) {
    return `v2:${createHmac("sha256", dedicatedSecret()).update(`mdi360:signup:binding:v2:${value}`).digest("hex")}`;
  }
  return createHmac("sha256", legacySecret()).update(value).digest("hex");
}
export function signupDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function signupBinding(value: string) {
  return binding(value, true);
}
/** Keep outstanding legacy confirmations valid when a dedicated key is added. */
export function signupBindingCandidates(value: string) {
  const values: string[] = [];
  if (process.env.SIGNUP_DATA_SECRET) values.push(binding(value, true));
  if ((process.env.SESSION_SECRET ?? "").length >= 24) values.push(binding(value, false));
  if (!values.length) throw new Error("SIGNUP_DATA_SECRET_INVALID");
  return values;
}
export function encryptSignupPayload(value: unknown) {
  const key = createHash("sha256")
    .update(`mdi360:signup:encryption:v2:${dedicatedSecret()}`)
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return `v2.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}
export function decryptSignupPayload(value: string) {
  const dedicated = value.startsWith("v2.");
  const [iv, tag, data] = (dedicated ? value.slice(3) : value).split(".");
  if (!iv || !tag || !data) throw new Error("INVALID_ENCRYPTED_SIGNUP");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    createHash("sha256")
      .update(dedicated ? `mdi360:signup:encryption:v2:${dedicatedSecret()}` : legacySecret())
      .digest(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString(),
  );
}
