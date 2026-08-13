import { createHash } from "node:crypto";

import {
  getConfiguredMercadoPagoCredentials,
  getMercadoPagoCredentials,
  type MercadoPagoCredentials,
} from "@/lib/billing/mercado-pago-config.server";
import { validateMercadoPagoWebhookSignature } from "@/lib/billing/mercado-pago-signature";

const API_URL = "https://api.mercadopago.com";

export class MercadoPagoHttpError extends Error {}

type MercadoPagoErrorDetail = {
  code?: string;
  message?: string;
  detail?: string;
};

type MercadoPagoErrorPayload = {
  message?: string;
  error?: string;
  code?: string;
  errors?: MercadoPagoErrorDetail[];
  cause?: MercadoPagoErrorDetail[];
};

function describeMercadoPagoError(payload: MercadoPagoErrorPayload) {
  const details = [...(payload.errors ?? []), ...(payload.cause ?? [])]
    .flatMap((item) => [item.code, item.message, item.detail])
    .filter((value): value is string => Boolean(value));
  return [...new Set([payload.code, payload.error, payload.message, ...details].filter(Boolean))]
    .join(" | ")
    .slice(0, 600);
}

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

async function request(
  path: string,
  init: RequestInit,
  idempotencyKey?: string,
  suppliedCredentials?: MercadoPagoCredentials,
) {
  const credentials = suppliedCredentials ?? (await getMercadoPagoCredentials());
  let response: Response | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3 && !response; attempt += 1) {
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${credentials.accessToken}`,
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
  const payload = (await response.json().catch(() => ({}))) as MercadoPagoOrder &
    MercadoPagoErrorPayload;
  if (!response.ok) {
    const description = describeMercadoPagoError(payload) || "erro sem detalhes";
    throw new MercadoPagoHttpError(`MERCADO_PAGO_HTTP_${response.status}:${description}`);
  }
  return payload;
}

const accountIdPromises = new Map<string, Promise<string>>();
export function getMercadoPagoAccountId(credentials: MercadoPagoCredentials) {
  const cacheKey = `${credentials.environment}:${createHash("sha256").update(credentials.accessToken).digest("hex")}`;
  let promise = accountIdPromises.get(cacheKey);
  promise ??= request("/users/me", { method: "GET" }, undefined, credentials).then((account) => {
    if (!account.id) throw new Error("MERCADO_PAGO_ACCOUNT_UNKNOWN");
    return String(account.id);
  });
  accountIdPromises.set(cacheKey, promise);
  return promise;
}

export function createMercadoPagoOrder(
  body: unknown,
  idempotencyKey: string,
  credentials: MercadoPagoCredentials,
) {
  return request(
    "/v1/orders",
    { method: "POST", body: JSON.stringify(body) },
    idempotencyKey,
    credentials,
  );
}

export function getMercadoPagoOrder(orderId: string, credentials: MercadoPagoCredentials) {
  return request(
    `/v1/orders/${encodeURIComponent(orderId)}`,
    { method: "GET" },
    undefined,
    credentials,
  );
}

export function cancelMercadoPagoOrder(
  orderId: string,
  idempotencyKey: string,
  credentials: MercadoPagoCredentials,
) {
  return request(
    `/v1/orders/${encodeURIComponent(orderId)}/cancel`,
    { method: "POST", body: "{}" },
    idempotencyKey,
    credentials,
  );
}

export function paymentFromOrder(order: MercadoPagoOrder) {
  return order.transactions?.payments?.[0] ?? null;
}

export async function validateMercadoPagoWebhook(request: Request, dataId: string) {
  const profiles = await getConfiguredMercadoPagoCredentials();
  for (const credentials of profiles) {
    if (
      credentials.webhookSecret &&
      validateMercadoPagoWebhookSignature(request, dataId, credentials.webhookSecret)
    ) {
      return credentials;
    }
  }
  return null;
}
