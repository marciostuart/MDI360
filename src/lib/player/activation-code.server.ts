/**
 * Activation codes are uppercase alphanumeric with ambiguous characters removed
 * (no O/0, I/1). 6 characters over a 32-symbol alphabet gives ~1 billion codes,
 * and each code stays reserved only while its device row exists.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ACTIVATION_CODE_LENGTH = 6;

export function newActivationCode() {
  const { randomInt } = require("node:crypto") as typeof import("node:crypto");
  let code = "";
  for (let i = 0; i < ACTIVATION_CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return code;
}

export function normalizeActivationCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}