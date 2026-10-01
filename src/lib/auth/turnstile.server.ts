import { randomUUID } from "node:crypto";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function getTurnstileConfig() {
  const siteKey = (process.env.TURNSTILE_SITE_KEY ?? "").trim();
  const secretKey = (process.env.TURNSTILE_SECRET_KEY ?? "").trim();
  return { siteKey, secretKey, enabled: Boolean(siteKey && secretKey) };
}

export async function verifyTurnstileToken(token: string | undefined, expectedAction: string) {
  const config = getTurnstileConfig();
  if (!config.enabled) return true;
  if (!token || token.length > 2048) return false;

  const response = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secret: config.secretKey,
      response: token,
      idempotency_key: randomUUID(),
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return false;
  const result = (await response.json()) as {
    success?: boolean;
    action?: string;
  };
  return result.success === true && (!result.action || result.action === expectedAction);
}
