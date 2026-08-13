import { randomBytes } from "node:crypto";

import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";

import {
  cycleDays,
  dueAtForClosing,
  firstUnclosedPeriod,
  isBillingClosingDay,
  nextClosingAt,
} from "@/lib/billing/cycles";
import { prorate } from "@/lib/billing/billing.server";
import { getDb, schema } from "@/lib/db/index.server";

const ACTIVE_INVOICE_STATUSES = ["open", "overdue"] as const;

function invoiceNumber(periodEnd: Date, organizationId: string) {
  const date = periodEnd.toISOString().slice(0, 10).replaceAll("-", "");
  return `FAT-${date}-${organizationId.slice(0, 6).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function wholeDays(from: Date, to: Date) {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

async function closeOnePeriod(
  organizationId: string,
  periodStart: Date,
  periodEnd: Date,
  now: Date,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`billing:${organizationId}`}))`);

    const existing = await tx
      .select({ id: schema.billingInvoices.id })
      .from(schema.billingInvoices)
      .where(
        and(
          eq(schema.billingInvoices.organizationId, organizationId),
          eq(schema.billingInvoices.periodEnd, periodEnd),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0].id;

    const [pricing] = await tx
      .select({
        billingEnabled: schema.organizations.billingEnabled,
        pendingClosingDay: schema.organizations.billingPendingClosingDay,
        unitOverride: schema.organizations.pricePerDeviceOverride,
        unitPrice: schema.plans.pricePerDeviceCents,
        flatPrice: schema.plans.priceCents,
        planName: schema.plans.name,
      })
      .from(schema.organizations)
      .leftJoin(schema.plans, eq(schema.plans.id, schema.organizations.planId))
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);
    if (!pricing?.billingEnabled) return null;

    const unitPrice = pricing.unitOverride ?? pricing.unitPrice ?? 0;
    const flatPrice = pricing.flatPrice ?? 0;
    const daysInCycle = cycleDays(periodStart, periodEnd);

    if (unitPrice > 0) {
      const devices = await tx
        .select({
          id: schema.devices.id,
          name: schema.devices.name,
          createdAt: schema.devices.createdAt,
        })
        .from(schema.devices)
        .where(
          and(
            eq(schema.devices.organizationId, organizationId),
            eq(schema.devices.status, "active"),
            lte(schema.devices.createdAt, periodEnd),
          ),
        );

      for (const device of devices) {
        const from = device.createdAt > periodStart ? device.createdAt : periodStart;
        const days = wholeDays(from, periodEnd);
        await tx
          .insert(schema.billingEntries)
          .values({
            organizationId,
            deviceId: device.id,
            deviceName: device.name,
            kind: "charge",
            periodStart,
            periodEnd,
            chargedFrom: from,
            days,
            cycleDays: daysInCycle,
            unitPriceCents: unitPrice,
            amountCents: prorate(unitPrice, days, daysInCycle),
          })
          .onConflictDoNothing();
      }
    }

    const ledger = await tx
      .select()
      .from(schema.billingEntries)
      .where(
        and(
          eq(schema.billingEntries.organizationId, organizationId),
          eq(schema.billingEntries.periodStart, periodStart),
          eq(schema.billingEntries.periodEnd, periodEnd),
        ),
      )
      .orderBy(asc(schema.billingEntries.createdAt));

    const subtotalCents =
      unitPrice > 0
        ? ledger.filter((entry) => entry.amountCents > 0).reduce((sum, entry) => sum + entry.amountCents, 0)
        : Math.max(0, flatPrice);
    const creditsCents = ledger
      .filter((entry) => entry.amountCents < 0)
      .reduce((sum, entry) => sum + entry.amountCents, 0);
    const totalCents = Math.max(0, subtotalCents + creditsCents);
    const paidImmediately = totalCents === 0;

    const [invoice] = await tx
      .insert(schema.billingInvoices)
      .values({
        organizationId,
        number: invoiceNumber(periodEnd, organizationId),
        periodStart,
        periodEnd,
        dueAt: dueAtForClosing(periodEnd),
        status: paidImmediately ? "paid" : "open",
        subtotalCents,
        creditsCents,
        totalCents,
        closedAt: now,
        paidAt: paidImmediately ? now : null,
      })
      .returning({ id: schema.billingInvoices.id });

    if (unitPrice > 0 && ledger.length > 0) {
      await tx.insert(schema.billingInvoiceItems).values(
        ledger.map((entry) => ({
          invoiceId: invoice.id,
          billingEntryId: entry.id,
          description:
            entry.amountCents < 0
              ? `Crédito por desvinculação: ${entry.deviceName}`
              : `Terminal ativo: ${entry.deviceName}`,
          quantity: entry.days,
          unitAmountCents: entry.unitPriceCents,
          amountCents: entry.amountCents,
          metadata: { cycleDays: entry.cycleDays, chargedFrom: entry.chargedFrom.toISOString() },
        })),
      );
    } else if (flatPrice > 0) {
      await tx.insert(schema.billingInvoiceItems).values({
        invoiceId: invoice.id,
        description: `Plano ${pricing.planName ?? "MDI 360"}`,
        quantity: 1,
        unitAmountCents: flatPrice,
        amountCents: flatPrice,
      });
    }

    if (!paidImmediately) {
      await tx
        .insert(schema.billingNotifications)
        .values({ organizationId, invoiceId: invoice.id, kind: "closing" })
        .onConflictDoNothing();
    }

    if (
      pricing.pendingClosingDay != null &&
      isBillingClosingDay(pricing.pendingClosingDay)
    ) {
      await tx
        .update(schema.organizations)
        .set({
          billingClosingDay: pricing.pendingClosingDay,
          billingPendingClosingDay: null,
        })
        .where(eq(schema.organizations.id, organizationId));
    }

    return invoice.id;
  });
}

/** Closes every elapsed cycle. Unique constraints make repeated scheduler runs safe. */
export async function closeElapsedBillingCycles(now = new Date()) {
  const db = getDb();
  const organizations = await db
    .select({
      id: schema.organizations.id,
      closingDay: schema.organizations.billingClosingDay,
      activatedAt: schema.organizations.billingActivatedAt,
      createdAt: schema.organizations.createdAt,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.billingEnabled, true));

  let closed = 0;
  for (const organization of organizations) {
    const closingDay = organization.closingDay;
    if (closingDay == null || !isBillingClosingDay(closingDay)) continue;
    const [last] = await db
      .select({ periodEnd: schema.billingInvoices.periodEnd })
      .from(schema.billingInvoices)
      .where(eq(schema.billingInvoices.organizationId, organization.id))
      .orderBy(desc(schema.billingInvoices.periodEnd))
      .limit(1);

    let period = firstUnclosedPeriod(
      organization.activatedAt ?? organization.createdAt,
      closingDay,
      last?.periodEnd,
    );
    let guard = 0;
    while (period.end <= now && guard < 24) {
      if (await closeOnePeriod(organization.id, period.start, period.end, now)) closed += 1;
      period = {
        start: period.end,
        end: nextClosingAt(period.end, closingDay),
        cycleDays: cycleDays(period.end, nextClosingAt(period.end, closingDay)),
      };
      guard += 1;
    }
  }
  return { closed };
}

/** Marks invoices and accounts overdue only after the full due date has elapsed. */
export async function enforceBillingSuspensions(now = new Date()) {
  const db = getDb();
  await db
    .update(schema.billingInvoices)
    .set({ status: "overdue" })
    .where(
      and(
        eq(schema.billingInvoices.status, "open"),
        lte(schema.billingInvoices.dueAt, now),
      ),
    );

  const overdueOrganizations = await db
    .selectDistinct({ id: schema.billingInvoices.organizationId })
    .from(schema.billingInvoices)
    .innerJoin(
      schema.organizations,
      eq(schema.organizations.id, schema.billingInvoices.organizationId),
    )
    .where(
      and(
        eq(schema.organizations.billingEnabled, true),
        eq(schema.billingInvoices.status, "overdue"),
      ),
    );

  for (const organization of overdueOrganizations) {
    await db
      .update(schema.organizations)
      .set({ subscriptionStatus: "suspended", billingSuspendedAt: now })
      .where(eq(schema.organizations.id, organization.id));
  }
  return { suspended: overdueOrganizations.length };
}

export async function queueDueDateNotifications(now = new Date()) {
  const db = getDb();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const start = new Date(`${parts}T00:00:00-03:00`);
  const end = new Date(`${parts}T23:59:59.999-03:00`);
  const due = await db
    .select({ id: schema.billingInvoices.id, organizationId: schema.billingInvoices.organizationId })
    .from(schema.billingInvoices)
    .where(
      and(
        eq(schema.billingInvoices.status, "open"),
        lte(schema.billingInvoices.dueAt, end),
        isNotNull(schema.billingInvoices.dueAt),
      ),
    );
  for (const invoice of due) {
    const [row] = await db
      .select({ dueAt: schema.billingInvoices.dueAt })
      .from(schema.billingInvoices)
      .where(eq(schema.billingInvoices.id, invoice.id))
      .limit(1);
    if (!row || row.dueAt < start) continue;
    await db
      .insert(schema.billingNotifications)
      .values({ organizationId: invoice.organizationId, invoiceId: invoice.id, kind: "due" })
      .onConflictDoNothing();
  }
}

export async function getPostpaidDashboard(organizationId: string) {
  const db = getDb();
  const [organization] = await db
    .select({
      enabled: schema.organizations.billingEnabled,
      closingDay: schema.organizations.billingClosingDay,
      pendingClosingDay: schema.organizations.billingPendingClosingDay,
      activatedAt: schema.organizations.billingActivatedAt,
      subscriptionStatus: schema.organizations.subscriptionStatus,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);
  const invoices = await db
    .select()
    .from(schema.billingInvoices)
    .where(eq(schema.billingInvoices.organizationId, organizationId))
    .orderBy(desc(schema.billingInvoices.createdAt));
  const attempts = await db
    .select()
    .from(schema.billingPaymentAttempts)
    .where(eq(schema.billingPaymentAttempts.organizationId, organizationId))
    .orderBy(desc(schema.billingPaymentAttempts.createdAt))
    .limit(20);
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const invoiceItems = invoiceIds.length
    ? await db
        .select({
          id: schema.billingInvoiceItems.id,
          invoiceId: schema.billingInvoiceItems.invoiceId,
          description: schema.billingInvoiceItems.description,
          amountCents: schema.billingInvoiceItems.amountCents,
        })
        .from(schema.billingInvoiceItems)
        .where(inArray(schema.billingInvoiceItems.invoiceId, invoiceIds))
        .orderBy(asc(schema.billingInvoiceItems.createdAt))
    : [];
  const outstanding = invoices.filter((invoice) =>
    ACTIVE_INVOICE_STATUSES.includes(invoice.status as (typeof ACTIVE_INVOICE_STATUSES)[number]),
  );
  return {
    organization,
    invoices,
    invoiceItems,
    attempts,
    outstandingCents: outstanding.reduce((sum, invoice) => sum + invoice.totalCents, 0),
    nextClosingAt:
      organization?.closingDay != null && isBillingClosingDay(organization.closingDay)
        ? nextClosingAt(new Date(), organization.closingDay).toISOString()
        : null,
  };
}

export async function setPendingClosingDay(organizationId: string, closingDay: number) {
  if (!isBillingClosingDay(closingDay)) throw new Error("INVALID_CLOSING_DAY");
  await getDb()
    .update(schema.organizations)
    .set({ billingPendingClosingDay: closingDay })
    .where(eq(schema.organizations.id, organizationId));
}

export async function listOutstandingInvoices(organizationId: string) {
  return getDb()
    .select()
    .from(schema.billingInvoices)
    .where(
      and(
        eq(schema.billingInvoices.organizationId, organizationId),
        inArray(schema.billingInvoices.status, [...ACTIVE_INVOICE_STATUSES]),
      ),
    )
    .orderBy(asc(schema.billingInvoices.dueAt));
}
