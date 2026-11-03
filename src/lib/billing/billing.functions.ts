import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { BillingSummary } from "@/lib/billing/billing.server";

export type { BillingSummary } from "@/lib/billing/billing.server";

/** Current invoice of the caller's own organization (per-screen, prorated). */
export const fetchBilling = createServerFn({ method: "GET" }).handler(
  async (): Promise<BillingSummary | null> => {
    const { isDatabaseConfigured } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return null;
    try {
      const { requireUser } = await import("@/lib/auth/session.server");
      const { getBillingSummary } = await import("@/lib/billing/billing.server");
      const user = await requireUser({ allowSuspended: true });
      return await getBillingSummary(user.organizationId);
    } catch (error) {
      console.error("fetchBilling failed", error);
      return null;
    }
  },
);

const attemptSchema = z.object({ method: z.literal("pix") });

function publicAttempt(attempt: {
  id: string;
  method: string;
  status: string;
  amountCents: number;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  redirectUrl: string | null;
  digitableLine: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: attempt.id,
    method: attempt.method,
    status: attempt.status,
    amountCents: attempt.amountCents,
    qrCode: attempt.qrCode,
    qrCodeBase64: attempt.qrCodeBase64,
    ticketUrl: attempt.ticketUrl,
    redirectUrl: attempt.redirectUrl,
    digitableLine: attempt.digitableLine,
    expiresAt: attempt.expiresAt,
    createdAt: attempt.createdAt,
  };
}

export const fetchPostpaidBilling = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUser } = await import("@/lib/auth/session.server");
  const { getPostpaidDashboard } = await import("@/lib/billing/postpaid.server");
  const { getDb, schema } = await import("@/lib/db/index.server");
  const { eq } = await import("drizzle-orm");
  const user = await requireUser({ allowSuspended: true });
  const { pay360BhStatus } = await import("@/lib/billing/pay360bh-config.server");
  const [activeAttempt] = await getDb()
    .select({
      id: schema.billingPaymentAttempts.id,
      method: schema.billingPaymentAttempts.method,
      status: schema.billingPaymentAttempts.status,
      amountCents: schema.billingPaymentAttempts.amountCents,
      qrCode: schema.billingPaymentAttempts.qrCode,
      qrCodeBase64: schema.billingPaymentAttempts.qrCodeBase64,
      ticketUrl: schema.billingPaymentAttempts.ticketUrl,
      redirectUrl: schema.billingPaymentAttempts.redirectUrl,
      digitableLine: schema.billingPaymentAttempts.digitableLine,
      expiresAt: schema.billingPaymentAttempts.expiresAt,
      createdAt: schema.billingPaymentAttempts.createdAt,
    })
    .from(schema.billingPaymentAttempts)
    .where(eq(schema.billingPaymentAttempts.activeKey, `org:${user.organizationId}`))
    .limit(1);
  return {
    ...(await getPostpaidDashboard(user.organizationId)),
    paymentProvider: "Pay 360BH",
    paymentReady: (await pay360BhStatus()).ready,
    activeAttempt: activeAttempt ? publicAttempt(activeAttempt) : null,
  };
});

export const createPaymentAttempt = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => attemptSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/lib/auth/session.server");
    const { createBillingAttempt } = await import("@/lib/billing/payments.server");
    const user = await requireUser({ allowSuspended: true });
    return createBillingAttempt({
      organizationId: user.organizationId,
      payerEmail: user.email,
      method: data.method,
    });
  });

export const refreshPaymentAttempt = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ attemptId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/lib/auth/session.server");
    const { getAttempt, reconcileAttempt } = await import("@/lib/billing/payments.server");
    const user = await requireUser({ allowSuspended: true });
    const attempt = await getAttempt(data.attemptId);
    if (!attempt || attempt.organizationId !== user.organizationId) throw new Error("NOT_FOUND");
    await reconcileAttempt(data.attemptId);
    const refreshed = await getAttempt(data.attemptId);
    return refreshed ? publicAttempt(refreshed) : null;
  });

export const fetchBoletoReceipt = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ attemptId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/lib/auth/session.server");
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { eq } = await import("drizzle-orm");
    const user = await requireUser({ allowSuspended: true });
    const [attempt] = await getDb()
      .select({
        id: schema.billingPaymentAttempts.id,
        organizationId: schema.billingPaymentAttempts.organizationId,
        method: schema.billingPaymentAttempts.method,
        status: schema.billingPaymentAttempts.status,
        amountCents: schema.billingPaymentAttempts.amountCents,
        digitableLine: schema.billingPaymentAttempts.digitableLine,
        ticketUrl: schema.billingPaymentAttempts.ticketUrl,
        redirectUrl: schema.billingPaymentAttempts.redirectUrl,
        expiresAt: schema.billingPaymentAttempts.expiresAt,
        createdAt: schema.billingPaymentAttempts.createdAt,
      })
      .from(schema.billingPaymentAttempts)
      .where(eq(schema.billingPaymentAttempts.id, data.attemptId))
      .limit(1);
    if (!attempt || attempt.organizationId !== user.organizationId || attempt.method !== "boleto") {
      throw new Error("NOT_FOUND");
    }
    return attempt;
  });

export const fetchInvoiceReceipt = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/lib/auth/session.server");
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { eq } = await import("drizzle-orm");
    const user = await requireUser({ allowSuspended: true });
    const db = getDb();
    const [invoice] = await db
      .select()
      .from(schema.billingInvoices)
      .where(eq(schema.billingInvoices.id, data.invoiceId))
      .limit(1);
    if (!invoice || invoice.organizationId !== user.organizationId) throw new Error("NOT_FOUND");
    const items = await db
      .select({
        id: schema.billingInvoiceItems.id,
        description: schema.billingInvoiceItems.description,
        amountCents: schema.billingInvoiceItems.amountCents,
      })
      .from(schema.billingInvoiceItems)
      .where(eq(schema.billingInvoiceItems.invoiceId, invoice.id))
      .orderBy(schema.billingInvoiceItems.createdAt);
    const attempts = await db
      .select({
        id: schema.billingPaymentAttempts.id,
        method: schema.billingPaymentAttempts.method,
        status: schema.billingPaymentAttempts.status,
        providerPaymentId: schema.billingPaymentAttempts.providerPaymentId,
        approvedAt: schema.billingPaymentAttempts.approvedAt,
      })
      .from(schema.billingPaymentAttempts)
      .innerJoin(
        schema.billingPaymentAttemptInvoices,
        eq(schema.billingPaymentAttemptInvoices.attemptId, schema.billingPaymentAttempts.id),
      )
      .where(eq(schema.billingPaymentAttemptInvoices.invoiceId, invoice.id));
    return { invoice, items, attempts };
  });

export const changeBillingClosingDay = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        closingDay: z.union([
          z.literal(1),
          z.literal(5),
          z.literal(10),
          z.literal(15),
          z.literal(20),
        ]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireRole } = await import("@/lib/auth/session.server");
    const { setPendingClosingDay } = await import("@/lib/billing/postpaid.server");
    const user = await requireRole("owner", "admin");
    await setPendingClosingDay(user.organizationId, data.closingDay);
    return { ok: true };
  });
