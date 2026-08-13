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

const boletoSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  documentType: z.enum(["CPF", "CNPJ"]),
  documentNumber: z.string().transform((value) => value.replace(/\D/g, "")).pipe(z.string().min(11).max(14)),
  zipCode: z.string().transform((value) => value.replace(/\D/g, "")).pipe(z.string().length(8)),
  street: z.string().trim().min(2).max(160),
  number: z.string().trim().min(1).max(30),
  neighborhood: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().toUpperCase().length(2),
});

const attemptSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("pix") }),
  z.object({
    method: z.literal("card"),
    card: z.object({
      token: z.string().min(10).max(500),
      paymentMethodId: z.string().min(1).max(60),
      documentType: z.string().max(10).optional(),
      documentNumber: z.string().transform((value) => value.replace(/\D/g, "")).pipe(z.string().max(20)).optional(),
    }),
  }),
  z.object({ method: z.literal("boleto"), boleto: boletoSchema }),
]);

export const fetchPostpaidBilling = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUser } = await import("@/lib/auth/session.server");
  const { getPostpaidDashboard } = await import("@/lib/billing/postpaid.server");
  const user = await requireUser({ allowSuspended: true });
  return {
    ...(await getPostpaidDashboard(user.organizationId)),
    publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY ?? null,
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
      card: data.method === "card" ? data.card : undefined,
      boleto: data.method === "boleto" ? data.boleto : undefined,
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
    return reconcileAttempt(data.attemptId);
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
    const [invoice] = await db.select().from(schema.billingInvoices).where(eq(schema.billingInvoices.id, data.invoiceId)).limit(1);
    if (!invoice || invoice.organizationId !== user.organizationId) throw new Error("NOT_FOUND");
    const items = await db.select({
      id: schema.billingInvoiceItems.id,
      description: schema.billingInvoiceItems.description,
      amountCents: schema.billingInvoiceItems.amountCents,
    }).from(schema.billingInvoiceItems).where(eq(schema.billingInvoiceItems.invoiceId, invoice.id)).orderBy(schema.billingInvoiceItems.createdAt);
    const attempts = await db
      .select({
        id: schema.billingPaymentAttempts.id,
        method: schema.billingPaymentAttempts.method,
        status: schema.billingPaymentAttempts.status,
        providerPaymentId: schema.billingPaymentAttempts.providerPaymentId,
        approvedAt: schema.billingPaymentAttempts.approvedAt,
      })
      .from(schema.billingPaymentAttempts)
      .innerJoin(schema.billingPaymentAttemptInvoices, eq(schema.billingPaymentAttemptInvoices.attemptId, schema.billingPaymentAttempts.id))
      .where(eq(schema.billingPaymentAttemptInvoices.invoiceId, invoice.id));
    return { invoice, items, attempts };
  });

export const changeBillingClosingDay = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ closingDay: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(15), z.literal(20)]) }).parse(input))
  .handler(async ({ data }) => {
    const { requireRole } = await import("@/lib/auth/session.server");
    const { setPendingClosingDay } = await import("@/lib/billing/postpaid.server");
    const user = await requireRole("owner", "admin");
    await setPendingClosingDay(user.organizationId, data.closingDay);
    return { ok: true };
  });
