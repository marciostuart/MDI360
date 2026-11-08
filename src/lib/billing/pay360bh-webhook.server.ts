import { timingSafeEqual } from "node:crypto";

import { and, eq, inArray, ne } from "drizzle-orm";

import { getPay360BhCredentials } from "@/lib/billing/pay360bh-config.server";
import { isPay360BhReceivedStatus } from "@/lib/billing/pay360bh-status";
import { getDb, schema } from "@/lib/db/index.server";

type Notification = {
  eventId: string;
  projectCode: string;
  reference: string;
  paymentId: string;
  status: "PENDING" | "RECEIVED" | "RECEIVED_IN_CASH";
};

function secureTokenMatch(received: string | null, expected: string) {
  if (!received) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseNotification(value: unknown): Notification | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (
    typeof body.evento_id !== "string" ||
    body.evento_id.length < 1 ||
    body.evento_id.length > 180 ||
    typeof body.projeto !== "string" ||
    body.projeto.length > 100 ||
    typeof body.referencia !== "string" ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(body.referencia) ||
    typeof body.cobranca_id !== "string" ||
    body.cobranca_id.length < 1 ||
    body.cobranca_id.length > 120 ||
    (body.status !== "PENDING" && !isPay360BhReceivedStatus(body.status))
  ) {
    return null;
  }
  return {
    eventId: body.evento_id,
    projectCode: body.projeto,
    reference: body.referencia,
    paymentId: body.cobranca_id,
    status: body.status,
  };
}

async function settleReceivedPayment(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  attempt: typeof schema.billingPaymentAttempts.$inferSelect,
) {
  const links = await tx
    .select({
      invoiceId: schema.billingPaymentAttemptInvoices.invoiceId,
      allocatedCents: schema.billingPaymentAttemptInvoices.allocatedCents,
      organizationId: schema.billingInvoices.organizationId,
    })
    .from(schema.billingPaymentAttemptInvoices)
    .innerJoin(
      schema.billingInvoices,
      eq(schema.billingInvoices.id, schema.billingPaymentAttemptInvoices.invoiceId),
    )
    .where(eq(schema.billingPaymentAttemptInvoices.attemptId, attempt.id));
  if (
    !links.length ||
    links.some((link) => link.organizationId !== attempt.organizationId) ||
    links.reduce((total, link) => total + link.allocatedCents, 0) !== attempt.amountCents
  ) {
    throw new Error("PAY360BH_INVOICE_ALLOCATION_MISMATCH");
  }

  const invoiceIds = links.map((link) => link.invoiceId);
  const unpaid = await tx
    .select({ id: schema.billingInvoices.id })
    .from(schema.billingInvoices)
    .where(
      and(
        inArray(schema.billingInvoices.id, invoiceIds),
        ne(schema.billingInvoices.status, "paid"),
      ),
    );
  if (!unpaid.length && attempt.status !== "approved") {
    await tx.insert(schema.billingCredits).values({
      organizationId: attempt.organizationId,
      attemptId: attempt.id,
      amountCents: attempt.amountCents,
      remainingCents: attempt.amountCents,
      reason: "Pagamento Pay 360BH recebido após baixa ou quitação da fatura",
    });
  } else if (invoiceIds.length) {
    await tx
      .update(schema.billingInvoices)
      .set({ status: "paid", paidAt: new Date() })
      .where(inArray(schema.billingInvoices.id, invoiceIds));
  }
  await tx
    .update(schema.billingPaymentAttempts)
    .set({ status: "approved", approvedAt: attempt.approvedAt ?? new Date(), activeKey: null })
    .where(eq(schema.billingPaymentAttempts.id, attempt.id));
  const [remaining] = await tx
    .select({ id: schema.billingInvoices.id })
    .from(schema.billingInvoices)
    .where(
      and(
        eq(schema.billingInvoices.organizationId, attempt.organizationId),
        eq(schema.billingInvoices.status, "overdue"),
      ),
    )
    .limit(1);
  if (!remaining) {
    await tx
      .update(schema.organizations)
      .set({ subscriptionStatus: "active", billingSuspendedAt: null })
      .where(eq(schema.organizations.id, attempt.organizationId));
  }
}

async function processNotification(event: Notification) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(schema.pay360BhBillingEvents)
      .values({
        eventId: event.eventId,
        projectCode: event.projectCode,
        reference: event.reference,
        paymentId: event.paymentId,
        status: event.status,
      })
      .onConflictDoNothing()
      .returning({ eventId: schema.pay360BhBillingEvents.eventId });
    if (!inserted) return { duplicate: true, matched: true };

    const [attempt] = await tx
      .select()
      .from(schema.billingPaymentAttempts)
      .where(eq(schema.billingPaymentAttempts.externalReference, event.reference))
      .for("update")
      .limit(1);
    if (!attempt || attempt.provider !== "pay360bh") {
      await tx
        .update(schema.pay360BhBillingEvents)
        .set({ processedAt: new Date() })
        .where(eq(schema.pay360BhBillingEvents.eventId, event.eventId));
      return { duplicate: false, matched: false };
    }
    if (attempt.providerPaymentId && attempt.providerPaymentId !== event.paymentId) {
      throw new Error("PAY360BH_PAYMENT_ID_MISMATCH");
    }

    if (isPay360BhReceivedStatus(event.status)) {
      if (attempt.status !== "approved") await settleReceivedPayment(tx, attempt);
      await tx
        .update(schema.billingPaymentAttempts)
        .set({
          providerOrderId: attempt.providerOrderId ?? event.paymentId,
          providerPaymentId: event.paymentId,
          providerLastUpdatedAt: new Date(),
        })
        .where(eq(schema.billingPaymentAttempts.id, attempt.id));
    } else if (["creating", "pending"].includes(attempt.status)) {
      await tx
        .update(schema.billingPaymentAttempts)
        .set({
          providerOrderId: attempt.providerOrderId ?? event.paymentId,
          providerPaymentId: attempt.providerPaymentId ?? event.paymentId,
          status: "pending",
          providerLastUpdatedAt: new Date(),
        })
        .where(eq(schema.billingPaymentAttempts.id, attempt.id));
    }
    await tx
      .update(schema.pay360BhBillingEvents)
      .set({ attemptId: attempt.id, processedAt: new Date() })
      .where(eq(schema.pay360BhBillingEvents.eventId, event.eventId));
    return { duplicate: false, matched: true };
  });
}

export async function receivePay360BhNotification(request: Request) {
  let credentials;
  try {
    credentials = await getPay360BhCredentials();
  } catch {
    return new Response("Integração indisponível", { status: 503 });
  }
  if (
    !secureTokenMatch(request.headers.get("X-Notificacao-Token"), credentials.notificationToken)
  ) {
    return new Response("Não autorizado", { status: 401 });
  }
  const rawBody = await request.text();
  if (rawBody.length > 32_000) return new Response("Requisição muito grande", { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }
  const event = parseNotification(body);
  if (!event || event.projectCode !== credentials.projectCode) {
    return new Response("Notificação inválida", { status: 400 });
  }
  try {
    const result = await processNotification(event);
    if (!result.matched && !result.duplicate) {
      console.error("[pay360bh-webhook] referência sem tentativa local", event.reference);
    }
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error(
      "[pay360bh-webhook] falha ao processar evento",
      error instanceof Error ? error.message : "erro",
    );
    return new Response("Falha temporária", { status: 500 });
  }
}
