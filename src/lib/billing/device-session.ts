export const MAX_DEVICE_SESSION_ID_LENGTH = 200;

/**
 * The Mercado Pago device identifier improves fraud analysis, but it is
 * optional. Never let a malformed value block the customer's payment.
 */
export function normalizeDeviceSessionId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  const hasControlCharacter = Array.from(normalized).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (
    normalized.length === 0 ||
    normalized.length > MAX_DEVICE_SESSION_ID_LENGTH ||
    hasControlCharacter
  ) {
    return undefined;
  }
  return normalized;
}
