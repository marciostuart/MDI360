import { createHmac, timingSafeEqual } from "node:crypto";

const API_URL = "https://api.mercadopago.com";

export class MercadoPagoHttpError extends Error {}

export type MercadoPagoOrder = {
  id?: string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  total_amount?: string | number;
  currency_id?: string;
  live_mode?: boolean;
  collector?: { id?: string | number };
  transactions?: {
    payments?: Array<{
      id?: string | number;
      status?: string;
      status_detail?: string;
      amount?: string | number;
      date_of_expiration?: string;
      payment_method?: {
        id?: string;
        type?: string;
        qr_code?: string;
        qr_code_base64?: string;
        ticket_url?: string;
        digitable_line?: string;
        barcode_content?: string;
        transaction_security?: { url?: string };
      };
      transaction_details?: { external_resource_url?: string };
    }>;
  };
};

function accessToken() {
  const value = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!value) throw new Error("MERCADO_PAGO_NOT_CONFIGURED");
  return value;
}

async function request(path: string, init: RequestInit, idempotencyKey?: string) {
  let response: Response | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3 && !response; attempt += 1) {
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${accessToken()}`,
          "content-type": "application/json",
          ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
          ...init.headers,
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      lastError = error;
    }
  }
  if (!response) {
    throw lastError instanceof Error ? lastError : new Error("MERCADO_PAGO_NETWORK_ERROR");
  }
  const payload = (await response.json().catch(() => ({}))) as MercadoPagoOrder & {
    message?: string;
  };
  if (!response.ok) {
    throw new MercadoPagoHttpError(
      `MERCADO_PAGO_HTTP_${response.status}:${payload.message ?? "erro"}`,
    );
  }
  return payload;
}

let accountIdPromise: Promise<string> | null = null;
export function getMercadoPagoAccountId() {
  accountIdPromise ??= request("/users/me", { method: "GET" }).then((account) => {
    if (!account.id) throw new Error("MERCADO_PAGO_ACCOUNT_UNKNOWN");
    return String(account.id);
  });
  return accountIdPromise;
}

export function createMercadoPagoOrder(body: unknown, idempotencyKey: string) {
  return request("/v1/orders", { method: "POST", body: JSON.stringify(body) }, idempotencyKey);
}

export function getMercadoPagoOrder(orderId: string) {
  return request(`/v1/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
}

export function cancelMercadoPagoOrder(orderId: string, idempotencyKey: string) {
  return request(
    `/v1/orders/${encodeURIComponent(orderId)}/cancel`,
    { method: "POST", body: "{}" },
    idempotencyKey,
  );
}

export function paymentFromOrder(order: MercadoPagoOrder) {
  return order.transactions?.payments?.[0] ?? null;
}

export function validateMercadoPagoWebhook(request: Request, dataId: string) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) throw new Error("MERCADO_PAGO_WEBHOOK_NOT_CONFIGURED");
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
  if (!ts || !received || !requestId) return false;
  const timestamp = Number(ts);
  const timestampMs = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestampMs) > 10 * 60_000) {
    return false;
  }
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}
