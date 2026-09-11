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
import {
  getMercadoPagoCredentials,
  type MercadoPagoEnvironment,
  type MercadoPagoCredentials,
} from "@/lib/billing/mercado-pago-config.server";
import { listOutstandingInvoices } from "@/lib/billing/postpaid.server";
import { getDb, schema } from "@/lib/db/index.server";
import { profileIsComplete } from "@/lib/billing/customer-profile";
import { buildBillingOrderPayload, buildBillingPayment } from "@/lib/billing/payment-payload";

export type BillingMethod = "pix" | "card" | "boleto";
const BILLING_REFERENCE_PREFIX = "mdi360_";
const LEGACY_BILLING_REFERENCE_PREFIX = "mdi360:";
export type CreateAttemptInput = {
  organizationId: string;
  payerEmail: string;
  deviceSessionId?: string;
  method: BillingMethod;
  card?: { token: string; paymentMethodId: string; documentType?: string; documentNumber?: string };
};

function amount(value: number) {
  return (value / 100).toFixed(2);
}

function paymentEnvironment(value: string): MercadoPagoEnvironment {
  if (value !== "test" && value !== "production") {
    throw new Error("INVALID_PAYMENT_ENVIRONMENT");
  }
  return value;
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
      const credentials = await getMercadoPagoCredentials(
        paymentEnvironment(active.providerEnvironment),
      );
      await cancelMercadoPagoOrder(active.providerOrderId, `cancel-${active.id}`, credentials);
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
  const credentials = await getMercadoPagoCredentials();
  const invoices = await listOutstandingInvoices(input.organizationId);
  const totalCents = invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  if (!invoices.length || totalCents <= 0) throw new Error("NO_OUTSTANDING_INVOICES");
  if (input.method === "card" && (!input.card?.token || !input.card.paymentMethodId)) {
    throw new Error("INVALID_CARD_DATA");
  }
  const db = getDb();
  const [[profile], [organization], [lastApprovedAttempt]] = await Promise.all([
    db
      .select()
      .from(schema.billingProfiles)
      .where(eq(schema.billingProfiles.organizationId, input.organizationId))
      .limit(1),
    db
      .select({ createdAt: schema.organizations.createdAt })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, input.organizationId))
      .limit(1),
    db
      .select({ approvedAt: schema.billingPaymentAttempts.approvedAt })
      .from(schema.billingPaymentAttempts)
      .where(
        and(
          eq(schema.billingPaymentAttempts.organizationId, input.organizationId),
          eq(schema.billingPaymentAttempts.status, "approved"),
        ),
      )
      .orderBy(desc(schema.billingPaymentAttempts.approvedAt))
      .limit(1),
  ]);
  if (!profileIsComplete(profile)) throw new Error("INCOMPLETE_CUSTOMER_PROFILE");

  await cancelActiveAttempt(input.organizationId);

  const attemptId = randomUUID();
  const externalReference = `${BILLING_REFERENCE_PREFIX}${attemptId}`;
  const idempotencyKey = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.billingPaymentAttempts).values({
      id: attemptId,
      organizationId: input.organizationId,
      method: input.method,
      providerEnvironment: credentials.environment,
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
  });

  const [firstName, ...lastNameParts] = profile.legalName.trim().split(/\s+/);
  const phone = profile.phone.replace(/\D/g, "");
  const payer: Record<string, unknown> = {
    email: input.payerEmail,
    first_name: firstName,
    last_name: lastNameParts.join(" ") || firstName,
    identification: { type: profile.documentType, number: profile.documentNumber },
    phone: { area_code: phone.slice(0, 2), number: phone.slice(2) },
    address: {
      zip_code: profile.zipCode,
      street_name: profile.street,
      street_number: profile.number,
      neighborhood: profile.neighborhood,
      city: profile.city,
      state: profile.state,
      ...(profile.complement ? { complement: profile.complement } : {}),
    },
  };
  const payment = buildBillingPayment(input.method, amount(totalCents), input.card);
  const orderPayload = buildBillingOrderPayload({
    method: input.method,
    totalAmount: amount(totalCents),
    externalReference,
    payerEmail: input.payerEmail,
    payer,
    payment,
    items: invoices.map((invoice) => ({
      external_code: `invoice_${invoice.id}`,
      title: `Fatura MDI 360 ${invoice.number}`,
      description: "Serviços de sinalização digital e atendimento",
      category_id: "services",
      quantity: 1,
      unit_price: amount(invoice.totalCents),
    })),
    additionalInfo: {
      "payer.registration_date": organization?.createdAt?.toISOString(),
      "payer.authentication_type": "WEB",
      "payer.is_first_purchase_online": !lastApprovedAttempt,
      ...(lastApprovedAttempt?.approvedAt
        ? { "payer.last_purchase": lastApprovedAttempt.approvedAt.toISOString() }
        : {}),
    },
  });

  try {
    const order = await createMercadoPagoOrder(
      orderPayload,
      idempotencyKey,
      credentials,
      input.deviceSessionId,
    );
    // Card orders may be approved synchronously. Run the exact same strict
    // reconciliation used by the webhook instead of waiting for a notification.
    // Persist the provider ID first so an interrupted validation can be recovered
    // by the periodic reconciler without creating a second charge.
    await updateAttemptFromOrder(attemptId, order);
    return reconcileMercadoPagoOrder(order, credentials);
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

export async function reconcileMercadoPagoOrder(
  order: MercadoPagoOrder,
  suppliedCredentials?: MercadoPagoCredentials,
) {
  const reference = order.external_reference;
  const prefix = reference?.startsWith(BILLING_REFERENCE_PREFIX)
    ? BILLING_REFERENCE_PREFIX
    : reference?.startsWith(LEGACY_BILLING_REFERENCE_PREFIX)
      ? LEGACY_BILLING_REFERENCE_PREFIX
      : null;
  if (!reference || !prefix) throw new Error("UNKNOWN_EXTERNAL_REFERENCE");
  const attemptId = reference.slice(prefix.length);
  const db = getDb();
  const attempt = await getAttempt(attemptId);
  if (!attempt) throw new Error("UNKNOWN_PAYMENT_ATTEMPT");
  const credentials =
    suppliedCredentials ??
    (await getMercadoPagoCredentials(paymentEnvironment(attempt.providerEnvironment)));
  if (credentials.environment !== attempt.providerEnvironment) {
    throw new Error("PAYMENT_CREDENTIAL_PROFILE_MISMATCH");
  }
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
  const actualCents = Math.round(
    Number(order.total_amount ?? paymentFromOrder(order)?.amount ?? 0) * 100,
  );
  if (actualCents !== attempt.amountCents || (order.currency_id && order.currency_id !== "BRL")) {
    throw new Error("PAYMENT_RECONCILIATION_MISMATCH");
  }
  const expectedAccount = credentials.accountId;
  const actualAccount =
    order.collector?.id != null
      ? String(order.collector.id)
      : await getMercadoPagoAccountId(credentials);
  if (actualAccount !== expectedAccount) {
    throw new Error("PAYMENT_RECEIVER_MISMATCH");
  }
  if (order.live_mode != null && order.live_mode !== credentials.liveMode) {
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
        ? await tx
            .select({ id: schema.billingInvoices.id })
            .from(schema.billingInvoices)
            .where(
              and(
                inArray(schema.billingInvoices.id, invoiceIds),
                ne(schema.billingInvoices.status, "paid"),
              ),
            )
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
        await tx
          .update(schema.billingInvoices)
          .set({ status: "paid", paidAt: new Date() })
          .where(inArray(schema.billingInvoices.id, invoiceIds));
      }
      await tx
        .update(schema.billingPaymentAttempts)
        .set({ status: "approved", approvedAt: new Date(), activeKey: null })
        .where(eq(schema.billingPaymentAttempts.id, attemptId));
      const remaining = await tx
        .select({ id: schema.billingInvoices.id })
        .from(schema.billingInvoices)
        .where(
          and(
            eq(schema.billingInvoices.organizationId, attempt.organizationId),
            eq(schema.billingInvoices.status, "overdue"),
          ),
        )
        .limit(1);
      if (!remaining[0]) {
        await tx
          .update(schema.organizations)
          .set({ subscriptionStatus: "active", billingSuspendedAt: null })
          .where(eq(schema.organizations.id, attempt.organizationId));
      }
    });
  } else if (["refunded", "charged_back"].includes(normalized)) {
    const [credit] = await db
      .select()
      .from(schema.billingCredits)
      .where(eq(schema.billingCredits.attemptId, attemptId))
      .limit(1);
    if (credit) {
      // A duplicated/late payment created credit rather than settling the linked
      // invoices. Reversing it must remove that credit, not reopen valid invoices.
      await db
        .update(schema.billingCredits)
        .set({ remainingCents: 0 })
        .where(eq(schema.billingCredits.id, credit.id));
      return getAttempt(attemptId);
    }
    const links = await db
      .select({ invoiceId: schema.billingPaymentAttemptInvoices.invoiceId })
      .from(schema.billingPaymentAttemptInvoices)
      .where(eq(schema.billingPaymentAttemptInvoices.attemptId, attemptId));
    const ids = links.map((link) => link.invoiceId);
    if (ids.length)
      await db
        .update(schema.billingInvoices)
        .set({ status: "overdue", paidAt: null })
        .where(inArray(schema.billingInvoices.id, ids));
    await db
      .update(schema.organizations)
      .set({ subscriptionStatus: "suspended", billingSuspendedAt: new Date() })
      .where(eq(schema.organizations.id, attempt.organizationId));
  }
  return getAttempt(attemptId);
}

export async function reconcileAttempt(attemptId: string) {
  const attempt = await getAttempt(attemptId);
  if (!attempt?.providerOrderId) return attempt;
  const credentials = await getMercadoPagoCredentials(
    paymentEnvironment(attempt.providerEnvironment),
  );
  return reconcileMercadoPagoOrder(
    await getMercadoPagoOrder(attempt.providerOrderId, credentials),
    credentials,
  );
}

export async function reconcilePendingAttempts() {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const attempts = await getDb()
    .select({ id: schema.billingPaymentAttempts.id })
    .from(schema.billingPaymentAttempts)
    .where(
      and(
        inArray(schema.billingPaymentAttempts.status, ["creating", "pending", "canceled"]),
        gt(schema.billingPaymentAttempts.createdAt, cutoff),
      ),
    )
    .orderBy(desc(schema.billingPaymentAttempts.createdAt))
    .limit(50);
  for (const attempt of attempts) {
    try {
      await reconcileAttempt(attempt.id);
    } catch (error) {
      console.error(
        "[billing-reconcile] falha",
        attempt.id,
        error instanceof Error ? error.message : "erro",
      );
    }
  }
}
