import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";

import { getMercadoPagoCredentials } from "@/lib/billing/mercado-pago-config.server";
import {
  cancelMercadoPagoOrder,
  createMercadoPagoOrder,
  getMercadoPagoAccountId,
  getMercadoPagoOrder,
  paymentFromOrder,
  type MercadoPagoOrder,
} from "@/lib/billing/mercado-pago.server";
import { getDb, schema } from "@/lib/db/index.server";

export type SandboxMethod = "pix" | "card" | "boleto";

const SANDBOX_REFERENCE_PREFIX = "mdi360_sandbox_";
const LEGACY_SANDBOX_REFERENCE_PREFIX = "mdi360-sandbox:";

type SandboxCard = {
  token: string;
  paymentMethodId: string;
  documentType?: string;
  documentNumber?: string;
};

function normalizeStatus(order: MercadoPagoOrder) {
  const payment = paymentFromOrder(order);
  const value = payment?.status ?? order.status ?? "pending";
  if (["processed", "approved", "paid"].includes(value)) return "approved";
  if (["canceled", "cancelled", "expired", "rejected", "failed"].includes(value)) return value;
  return "pending";
}

function amount(cents: number) {
  return (cents / 100).toFixed(2);
}

async function updateSandboxTest(
  id: string,
  order: MercadoPagoOrder,
  source: "create" | "poll" | "webhook",
) {
  const payment = paymentFromOrder(order);
  const method = payment?.payment_method;
  const now = new Date();
  await getDb()
    .update(schema.billingSandboxTests)
    .set({
      providerOrderId: order.id ?? null,
      providerPaymentId: payment?.id != null ? String(payment.id) : null,
      status: normalizeStatus(order),
      statusDetail: payment?.status_detail ?? order.status_detail ?? null,
      qrCode: method?.qr_code ?? null,
      qrCodeBase64: method?.qr_code_base64 ?? null,
      ticketUrl: method?.ticket_url ?? null,
      digitableLine: method?.digitable_line ?? method?.barcode_content ?? null,
      redirectUrl:
        method?.transaction_security?.url ??
        payment?.transaction_details?.external_resource_url ??
        null,
      expiresAt: payment?.date_of_expiration ? new Date(payment.date_of_expiration) : null,
      webhookReceivedAt: source === "webhook" ? now : undefined,
      providerLastUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.billingSandboxTests.id, id));
}

export async function reconcileSandboxOrder(
  order: MercadoPagoOrder,
  source: "create" | "poll" | "webhook" = "poll",
) {
  const reference = order.external_reference ?? "";
  const prefix = reference.startsWith(SANDBOX_REFERENCE_PREFIX)
    ? SANDBOX_REFERENCE_PREFIX
    : reference.startsWith(LEGACY_SANDBOX_REFERENCE_PREFIX)
      ? LEGACY_SANDBOX_REFERENCE_PREFIX
      : null;
  if (!prefix) throw new Error("UNKNOWN_SANDBOX_REFERENCE");
  const id = reference.slice(prefix.length);
  const db = getDb();
  const [test] = await db
    .select()
    .from(schema.billingSandboxTests)
    .where(eq(schema.billingSandboxTests.id, id))
    .limit(1);
  if (!test) throw new Error("UNKNOWN_SANDBOX_TEST");
  if (test.providerOrderId && order.id && test.providerOrderId !== order.id) {
    throw new Error("SANDBOX_ORDER_MISMATCH");
  }
  const actualCents = Math.round(
    Number(order.total_amount ?? paymentFromOrder(order)?.amount ?? 0) * 100,
  );
  if (actualCents !== test.amountCents || (order.currency_id && order.currency_id !== "BRL")) {
    throw new Error("SANDBOX_AMOUNT_MISMATCH");
  }
  const credentials = await getMercadoPagoCredentials("test");
  if (credentials.liveMode) throw new Error("SANDBOX_CREDENTIALS_REQUIRED");
  const receiver =
    order.collector?.id != null
      ? String(order.collector.id)
      : await getMercadoPagoAccountId(credentials);
  if (receiver !== credentials.accountId) throw new Error("SANDBOX_RECEIVER_MISMATCH");
  if (order.live_mode === true) throw new Error("LIVE_ORDER_REJECTED_IN_SANDBOX");
  await updateSandboxTest(id, order, source);
  return getSandboxTest(id);
}

export async function createSandboxTest(input: {
  method: SandboxMethod;
  amountCents: number;
  createdByUserId: string;
  card?: SandboxCard;
}) {
  if (
    !Number.isInteger(input.amountCents) ||
    input.amountCents < 100 ||
    input.amountCents > 100_000
  ) {
    throw new Error("INVALID_SANDBOX_AMOUNT");
  }
  if (input.method === "card" && (!input.card?.token || !input.card.paymentMethodId)) {
    throw new Error("INVALID_CARD_DATA");
  }
  const credentials = await getMercadoPagoCredentials("test");
  if (credentials.liveMode) throw new Error("SANDBOX_CREDENTIALS_REQUIRED");
  const id = randomUUID();
  const idempotencyKey = randomUUID();
  const externalReference = `${SANDBOX_REFERENCE_PREFIX}${id}`;
  const db = getDb();
  await db.insert(schema.billingSandboxTests).values({
    id,
    method: input.method,
    amountCents: input.amountCents,
    externalReference,
    idempotencyKey,
    createdByUserId: input.createdByUserId,
  });

  const basePayment = { amount: amount(input.amountCents) };
  let payer: Record<string, unknown>;
  let payment: Record<string, unknown>;
  if (input.method === "pix") {
    payer = { email: "test_user_br@testuser.com", first_name: "APRO" };
    payment = { ...basePayment, payment_method: { id: "pix", type: "bank_transfer" } };
  } else if (input.method === "card") {
    payer = { email: "test@testuser.com" };
    if (input.card?.documentNumber) {
      payer.identification = {
        type: input.card.documentType ?? "CPF",
        number: input.card.documentNumber,
      };
    }
    payment = {
      ...basePayment,
      payment_method: {
        id: input.card!.paymentMethodId,
        type: "credit_card",
        token: input.card!.token,
        installments: 1,
      },
    };
  } else {
    payer = {
      email: "test_user_br@testuser.com",
      first_name: "APRO",
      last_name: "TESTE",
      identification: { type: "CPF", number: "12345678909" },
      address: {
        zip_code: "06233903",
        street_name: "Av. das Nações Unidas",
        street_number: "3003",
        neighborhood: "Bonfim",
        city: "Osasco",
        state: "SP",
      },
    };
    payment = { ...basePayment, payment_method: { id: "boleto", type: "ticket" } };
  }

  try {
    const order = await createMercadoPagoOrder(
      {
        type: "online",
        processing_mode: "automatic",
        external_reference: externalReference,
        total_amount: amount(input.amountCents),
        payer,
        transactions: { payments: [payment] },
      },
      idempotencyKey,
      credentials,
    );
    await updateSandboxTest(id, order, "create");
    return reconcileSandboxOrder(order, "create");
  } catch (error) {
    await db
      .update(schema.billingSandboxTests)
      .set({
        status: "failed",
        statusDetail: error instanceof Error ? error.message.slice(0, 300) : "Falha",
        updatedAt: new Date(),
      })
      .where(eq(schema.billingSandboxTests.id, id));
    throw error;
  }
}

export async function getSandboxTest(id: string) {
  const [row] = await getDb()
    .select()
    .from(schema.billingSandboxTests)
    .where(eq(schema.billingSandboxTests.id, id))
    .limit(1);
  return row ?? null;
}

export async function markSandboxWebhookReceived(providerOrderId: string) {
  const now = new Date();
  const [test] = await getDb()
    .update(schema.billingSandboxTests)
    .set({ webhookReceivedAt: now, updatedAt: now })
    .where(eq(schema.billingSandboxTests.providerOrderId, providerOrderId))
    .returning({ id: schema.billingSandboxTests.id });
  return test ?? null;
}

export async function refreshSandboxTest(id: string) {
  const test = await getSandboxTest(id);
  if (!test?.providerOrderId) return test;
  const credentials = await getMercadoPagoCredentials("test");
  return reconcileSandboxOrder(
    await getMercadoPagoOrder(test.providerOrderId, credentials),
    "poll",
  );
}

export async function cancelSandboxTest(id: string) {
  const test = await getSandboxTest(id);
  if (!test) throw new Error("SANDBOX_TEST_NOT_FOUND");
  if (!test.providerOrderId || !["creating", "pending"].includes(test.status)) return test;
  const credentials = await getMercadoPagoCredentials("test");
  const order = await cancelMercadoPagoOrder(
    test.providerOrderId,
    `sandbox-cancel-${id}`,
    credentials,
  );
  return reconcileSandboxOrder(order, "poll");
}

export function listSandboxTests() {
  return getDb()
    .select()
    .from(schema.billingSandboxTests)
    .orderBy(desc(schema.billingSandboxTests.createdAt))
    .limit(50);
}
