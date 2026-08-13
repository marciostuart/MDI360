import { createHmac, timingSafeEqual } from "node:crypto";

export function validateMercadoPagoWebhookSignature(
  request: Request,
  dataId: string,
  secret: string,
) {
  return inspectMercadoPagoWebhookSignature(request, dataId, secret).valid;
}

export function inspectMercadoPagoWebhookSignature(
  request: Request,
  dataId: string,
  secret: string,
) {
  const signature = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";
  const values = Object.fromEntries(
    signature.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  const ts = values.ts;
  const received = values.v1;
  if (!signature) return { valid: false, reason: "missing_x_signature" } as const;
  if (!ts || !received) return { valid: false, reason: "malformed_x_signature" } as const;
  if (!requestId) return { valid: false, reason: "missing_x_request_id" } as const;
  const timestamp = Number(ts);
  const timestampMs = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  if (!Number.isFinite(timestamp)) return { valid: false, reason: "invalid_timestamp" } as const;
  if (Math.abs(Date.now() - timestampMs) > 10 * 60_000)
    return { valid: false, reason: "expired_timestamp" } as const;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  const valid =
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer);
  return { valid, reason: valid ? "valid" : "digest_mismatch" } as const;
}
