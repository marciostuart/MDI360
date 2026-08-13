import { randomUUID } from "node:crypto";

import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";

import {
  cancelMercadoPagoOrder,
  createMercadoPagoOrder,
  getMercadoPagoAccountId,
  getMercadoPagoOrder,
  MercadoPagoHttpError,
  paymentFromOrder,
  type MercadoPagoOrder,
} from "@/lib/billing/mercado-pago.server";
import { listOutstandingInvoices } from "@/lib/billing/postpaid.server";
import { getDb, schema } from "@/lib/db/index.server";

export type BillingMethod = "pix" | "card" | "boleto";
export type BoletoProfileInput = {
  legalName: string;
  documentType: "CPF" | "CNPJ";
  documentNumber: string;
  zipCode: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
};

export type CreateAttemptInput = {
  organizationId: string;
  payerEmail: string;
  method: BillingMethod;
  card?: { token: string; paymentMethodId: string; documentType?: string; documentNumber?: string };
  boleto?: BoletoProfileInput;
};

function amount(value: number) {
  return (value / 100).toFixed(2);
}

function orderStatus(order: MercadoPagoOrder) {
  const payment = paymentFromOrder(order);
  // Terminal order states must win over a stale nested transaction state.
  if (["refunded", "partially_refunded", "charged_back"].includes(order.status ?? "")) {
    return order.status!;
  }
  return payment?.status ?? order.status ?? "pending";
}

function normalizeStatus(value: string) {
  if (["processed", "approved", "paid"].includes(value)) return "approved";
  if (["canceled", "cancelled", "expired", "rejected", "failed"].includes(value)) return value;
  if (["refunded", "partially_refunded", "charged_back"].includes(value)) {
    return value === "partially_refunded" ? "refunded" : value;
  }
  return "pending";
}

async function cancelActiveAttempt(organizationId: string) {
  const db = getDb();
  const [active] = await db
    .select()
    .from(schema.billingPaymentAttempts)
    .where(eq(schema.billingPaymentAttempts.activeKey, `org:${organizationId}`))
    .limit(1);
  if (!active) return;
  if (!active.providerOrderId) throw new Error("PAYMENT_CREATION_IN_PROGRESS");
  if (active.providerOrderId) {
    try {
      await cancelMercadoPagoOrder(active.providerOrderId, `cancel-${active.id}`);
    } catch (error) {
      // Never create a second charge while the previous one may still be payable.
      throw new Error(
        `Não foi possível cancelar a cobrança anterior: ${error instanceof Error ? error.message : "erro"}`,
      );
    }
  }
  await db
    .update(schema.billingPaymentAttempts)
    .set({ status: "canceled", canceledAt: new Date(), activeKey: null })
    .where(eq(schema.billingPaymentAttempts.id, active.id));
}

export async function createBillingAttempt(input: CreateAttemptInput) {
  const invoices = await listOutstandingInvoices(input.organizationId);
  const totalCents = invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  if (!invoices.length || totalCents <= 0) throw new Error("NO_OUTSTANDING_INVOICES");
  if (input.method === "card" && (!input.card?.token || !input.card.paymentMethodId)) {
    throw new Error("INVALID_CARD_DATA");
  }
  if (input.method === "boleto" && !input.boleto) throw new Error("INVALID_BOLETO_PROFILE");

  await cancelActiveAttempt(input.organizationId);

  const db = getDb();
  const attemptId = randomUUID();
  const externalReference = `mdi360:${attemptId}`;
  const idempotencyKey = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.billingPaymentAttempts).values({
      id: attemptId,
      organizationId: input.organizationId,
      method: input.method,
      amountCents: totalCents,
      externalReference,
      idempotencyKey,
      activeKey: `org:${input.organizationId}`,
    });
    await tx.insert(schema.billingPaymentAttemptInvoices).values(
      invoices.map((invoice) => ({
        attemptId,
        invoiceId: invoice.id,
        allocatedCents: invoice.totalCents,
      })),
    );
    if (input.boleto) {
      await tx
        .insert(schema.billingProfiles)
        .values({ organizationId: input.organizationId, ...input.boleto })
        .onConflictDoUpdate({
          target: schema.billingProfiles.organizationId,
          set: { ...input.boleto, updatedAt: new Date() },
        });
    }
  });

  const basePayment = { amount: amount(totalCents) };
  let payment: Record<string, unknown>;
  let payer: Record<string, unknown> = { email: input.payerEmail };
  if (input.method === "pix") {
    payment = {
      ...basePayment,
      payment_method: { id: "pix", type: "bank_transfer" },
      expiration_time: "P1D",
    };
  } else if (input.method === "card") {
    payment = {
      ...basePayment,
      payment_method: {
        id: input.card!.paymentMethodId,
        type: "credit_card",
        token: input.card!.token,
        installments: 1,
      },
    };
    if (input.card!.documentNumber) {
      payer.identification = {
        type: input.card!.documentType ?? "CPF",
        number: input.card!.documentNumber,
      };
    }
  } else {
    const profile = input.boleto!;
    const [firstName, ...lastNameParts] = profile.legalName.trim().split(/\s+/);
    payment = {
      ...basePayment,
      payment_method: { id: "boleto", type: "ticket" },
      expiration_time: "P3D",
    };
    payer = {
      email: input.payerEmail,
      first_name: firstName,
      last_name: lastNameParts.join(" ") || firstName,
      identification: { type: profile.documentType, number: profile.documentNumber },
      address: {
        zip_code: profile.zipCode,
        street_name: profile.street,
        street_number: profile.number,
        neighborhood: profile.neighborhood,
        city: profile.city,
        federal_unit: profile.state,
      },
    };
  }

  try {
    const order = await createMercadoPagoOrder(
      {
        type: "online",
        processing_mode: "automatic",
        external_reference: externalReference,
        total_amount: amount(totalCents),
        ...(input.method === "card"
          ? {
              capture_mode: "automatic",
              config: {
                online: {
                  transaction_security: {
                    validation: "on_fraud_risk",
                    liability_shift: "required",
                  },
                },
              },
            }
          : {}),
        payer,
        transactions: { payments: [payment] },
      },
      idempotencyKey,
    );
    // Card orders may be approved synchronously. Run the exact same strict
    // reconciliation used by the webhook instead of waiting for a notification.
    // Persist the provider ID first so an interrupted validation can be recovered
    // by the periodic reconciler without creating a second charge.
    await updateAttemptFromOrder(attemptId, order);
    return reconcileMercadoPagoOrder(order);
  } catch (error) {
    const definitiveFailure = error instanceof MercadoPagoHttpError;
    await db
      .update(schema.billingPaymentAttempts)
      .set({
        status: definitiveFailure ? "failed" : "creating",
        activeKey: definitiveFailure ? null : `org:${input.organizationId}`,
        statusDetail: error instanceof Error ? error.message.slice(0, 300) : "Falha",
      })
      .where(eq(schema.billingPaymentAttempts.id, attemptId));
    throw error;
  }
}

async function updateAttemptFromOrder(attemptId: string, order: MercadoPagoOrder) {
  const payment = paymentFromOrder(order);
  const method = payment?.payment_method;
  const normalized = normalizeStatus(orderStatus(order));
  await getDb()
    .update(schema.billingPaymentAttempts)
    .set({
      providerOrderId: order.id ?? null,
      providerPaymentId: payment?.id != null ? String(payment.id) : null,
      status: normalized,
      activeKey: normalized === "pending" ? undefined : null,
      qrCode: method?.qr_code ?? null,
      qrCodeBase64: method?.qr_code_base64 ?? null,
      ticketUrl: method?.ticket_url ?? null,
      redirectUrl:
        method?.transaction_security?.url ??
        payment?.transaction_details?.external_resource_url ??
        null,
      digitableLine: method?.digitable_line ?? method?.barcode_content ?? null,
      statusDetail: payment?.status_detail ?? order.status_detail ?? null,
      expiresAt: payment?.date_of_expiration ? new Date(payment.date_of_expiration) : null,
      providerLastUpdatedAt: new Date(),
    })
    .where(eq(schema.billingPaymentAttempts.id, attemptId));
}

export async function getAttempt(attemptId: string) {
  const [attempt] = await getDb()
    .select()
    .from(schema.billingPaymentAttempts)
    .where(eq(schema.billingPaymentAttempts.id, attemptId))
    .limit(1);
  return attempt ?? null;
}

export async function reconcileMercadoPagoOrder(order: MercadoPagoOrder) {
  const reference = order.external_reference;
  if (!reference?.startsWith("mdi360:")) throw new Error("UNKNOWN_EXTERNAL_REFERENCE");
  const attemptId = reference.slice("mdi360:".length);
  const db = getDb();
  const attempt = await getAttempt(attemptId);
  if (!attempt) throw new Error("UNKNOWN_PAYMENT_ATTEMPT");
  if (attempt.providerOrderId && order.id && attempt.providerOrderId !== order.id) {
    throw new Error("PAYMENT_ORDER_MISMATCH");
  }
  const allocations = await db
    .select({
      allocatedCents: schema.billingPaymentAttemptInvoices.allocatedCents,
      organizationId: schema.billingInvoices.organizationId,
    })
    .from(schema.billingPaymentAttemptInvoices)
    .innerJoin(
      schema.billingInvoices,
      eq(schema.billingInvoices.id, schema.billingPaymentAttemptInvoices.invoiceId),
    )
    .where(eq(schema.billingPaymentAttemptInvoices.attemptId, attemptId));
  if (
    allocations.length === 0 ||
    allocations.some((item) => item.organizationId !== attempt.organizationId) ||
    allocations.reduce((sum, item) => sum + item.allocatedCents, 0) !== attempt.amountCents
  ) {
    throw new Error("PAYMENT_INVOICE_ALLOCATION_MISMATCH");
  }
  const actualCents = Math.round(Number(order.total_amount ?? paymentFromOrder(order)?.amount ?? 0) * 100);
  if (actualCents !== attempt.amountCents || order.currency_id && order.currency_id !== "BRL") {
    throw new Error("PAYMENT_RECONCILIATION_MISMATCH");
  }
  const expectedAccount = process.env.MERCADO_PAGO_ACCOUNT_ID;
  if (!expectedAccount) throw new Error("MERCADO_PAGO_ACCOUNT_ID_NOT_CONFIGURED");
  const actualAccount =
    order.collector?.id != null ? String(order.collector.id) : await getMercadoPagoAccountId();
  if (actualAccount !== expectedAccount) {
    throw new Error("PAYMENT_RECEIVER_MISMATCH");
  }
  const expectedLiveMode = process.env.MERCADO_PAGO_LIVE_MODE;
  if (expectedLiveMode !== "true" && expectedLiveMode !== "false") {
    throw new Error("MERCADO_PAGO_LIVE_MODE_NOT_CONFIGURED");
  }
  if (
    expectedLiveMode != null &&
    order.live_mode != null &&
    order.live_mode !== (expectedLiveMode === "true")
  ) {
    throw new Error("PAYMENT_ENVIRONMENT_MISMATCH");
  }

  const normalized = normalizeStatus(orderStatus(order));
  await updateAttemptFromOrder(attemptId, order);
  if (normalized === "approved") {
    await db.transaction(async (tx) => {
      const links = await tx
        .select({ invoiceId: schema.billingPaymentAttemptInvoices.invoiceId })
        .from(schema.billingPaymentAttemptInvoices)
        .where(eq(schema.billingPaymentAttemptInvoices.attemptId, attemptId));
      const invoiceIds = links.map((link) => link.invoiceId);
      const unpaid = invoiceIds.length
        ? await tx.select({ id: schema.billingInvoices.id }).from(schema.billingInvoices).where(and(inArray(schema.billingInvoices.id, invoiceIds), ne(schema.billingInvoices.status, "paid")))
        : [];
      if (unpaid.length === 0 && attempt.status !== "approved") {
        await tx.insert(schema.billingCredits).values({
          organizationId: attempt.organizationId,
          attemptId,
          amountCents: attempt.amountCents,
          remainingCents: attempt.amountCents,
          reason: "Pagamento aprovado após substituição ou quitação da cobrança",
        });
      } else if (invoiceIds.length) {
        await tx.update(schema.billingInvoices).set({ status: "paid", paidAt: new Date() }).where(inArray(schema.billingInvoices.id, invoiceIds));
      }
      await tx.update(schema.billingPaymentAttempts).set({ status: "approved", approvedAt: new Date(), activeKey: null }).where(eq(schema.billingPaymentAttempts.id, attemptId));
      const remaining = await tx.select({ id: schema.billingInvoices.id }).from(schema.billingInvoices).where(and(eq(schema.billingInvoices.organizationId, attempt.organizationId), eq(schema.billingInvoices.status, "overdue"))).limit(1);
      if (!remaining[0]) {
        await tx.update(schema.organizations).set({ subscriptionStatus: "active", billingSuspendedAt: null }).where(eq(schema.organizations.id, attempt.organizationId));
      }
    });
  } else if (["refunded", "charged_back"].includes(normalized)) {
    const [credit] = await db.select().from(schema.billingCredits).where(eq(schema.billingCredits.attemptId, attemptId)).limit(1);
    if (credit) {
      // A duplicated/late payment created credit rather than settling the linked
      // invoices. Reversing it must remove that credit, not reopen valid invoices.
      await db.update(schema.billingCredits).set({ remainingCents: 0 }).where(eq(schema.billingCredits.id, credit.id));
      return getAttempt(attemptId);
    }
    const links = await db.select({ invoiceId: schema.billingPaymentAttemptInvoices.invoiceId }).from(schema.billingPaymentAttemptInvoices).where(eq(schema.billingPaymentAttemptInvoices.attemptId, attemptId));
    const ids = links.map((link) => link.invoiceId);
    if (ids.length) await db.update(schema.billingInvoices).set({ status: "overdue", paidAt: null }).where(inArray(schema.billingInvoices.id, ids));
    await db.update(schema.organizations).set({ subscriptionStatus: "suspended", billingSuspendedAt: new Date() }).where(eq(schema.organizations.id, attempt.organizationId));
  }
  return getAttempt(attemptId);
}

export async function reconcileAttempt(attemptId: string) {
  const attempt = await getAttempt(attemptId);
  if (!attempt?.providerOrderId) return attempt;
  return reconcileMercadoPagoOrder(await getMercadoPagoOrder(attempt.providerOrderId));
}

export async function reconcilePendingAttempts() {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const attempts = await getDb()
    .select({ id: schema.billingPaymentAttempts.id })
    .from(schema.billingPaymentAttempts)
    .where(and(inArray(schema.billingPaymentAttempts.status, ["creating", "pending", "canceled"]), gt(schema.billingPaymentAttempts.createdAt, cutoff)))
    .orderBy(desc(schema.billingPaymentAttempts.createdAt))
    .limit(50);
  for (const attempt of attempts) {
    try {
      await reconcileAttempt(attempt.id);
    } catch (error) {
      console.error("[billing-reconcile] falha", attempt.id, error instanceof Error ? error.message : "erro");
    }
  }
}
