/**
 * Per-screen (per-seat) billing, prorated by day.
 *
 * Model
 * -----
 * • The account pays `pricePerDeviceCents` per active screen, per month.
 * • The cycle runs from the billing anchor day to the same day of the next
 *   month. A screen linked mid-cycle is charged only for the remaining days,
 *   and a screen removed mid-cycle is credited for the days left.
 * • Storage is a plan-wide quota, never billed per screen.
 */
import { and, eq, gte, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";

export type BillingCycle = {
  start: Date;
  end: Date;
  /** Whole days in the cycle — the divisor of every proration. */
  cycleDays: number;
};

export type BillingEntryView = {
  id: string;
  deviceId: string | null;
  deviceName: string;
  kind: "charge" | "credit";
  chargedFrom: string;
  days: number;
  cycleDays: number;
  unitPriceCents: number;
  amountCents: number;
  createdAt: string;
};

export type BillingSummary = {
  planName: string | null;
  /** Monthly price of a single screen (0 = free plan, nothing is billed). */
  unitPriceCents: number;
  perDeviceBilling: boolean;
  activeDevices: number;
  cycleStart: string;
  cycleEnd: string;
  cycleDays: number;
  daysRemaining: number;
  /** Full price if every current screen stayed the whole next cycle. */
  recurringCents: number;
  chargesCents: number;
  creditsCents: number;
  /** What the customer owes for the current cycle. Never below zero. */
  totalCents: number;
  entries: BillingEntryView[];
};

const DAY_MS = 86_400_000;

/** Midnight (UTC) of the informed date — proration works on whole days. */
function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addMonths(date: Date, months: number) {
  const day = date.getUTCDate();
  const shifted = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 0, 0, 0, 0),
  );
  // Clamps 31 → 30/28 so anchors late in the month keep working every cycle.
  const lastDay = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate();
  shifted.setUTCDate(Math.min(day, lastDay));
  return shifted;
}

function wholeDays(from: Date, to: Date) {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS));
}

/** The cycle that contains `now`, derived from the account's anchor day. */
export function resolveCycle(anchor: Date, now = new Date()): BillingCycle {
  let start = startOfDay(anchor);
  const today = startOfDay(now);
  // Walk forward (or backward) in month steps until `today` falls in the cycle.
  let guard = 0;
  while (guard < 600) {
    const end = addMonths(start, 1);
    if (today < start) {
      start = addMonths(start, -1);
    } else if (today >= end) {
      start = end;
    } else {
      return { start, end, cycleDays: Math.max(1, wholeDays(start, end)) };
    }
    guard += 1;
  }
  const end = addMonths(start, 1);
  return { start, end, cycleDays: Math.max(1, wholeDays(start, end)) };
}

/** Prorated value of one screen for `days` out of the cycle. */
export function prorate(unitPriceCents: number, days: number, cycleDays: number) {
  if (unitPriceCents <= 0 || days <= 0) return 0;
  const capped = Math.min(days, cycleDays);
  return Math.round((unitPriceCents * capped) / cycleDays);
}

type BillingContext = {
  organizationId: string;
  planName: string | null;
  unitPriceCents: number;
  cycle: BillingCycle;
};

export async function getBillingContext(
  organizationId: string,
  now = new Date(),
): Promise<BillingContext> {
  const db = getDb();
  const rows = await db
    .select({
      planName: schema.plans.name,
      planUnit: schema.plans.pricePerDeviceCents,
      unitOverride: schema.organizations.pricePerDeviceOverride,
      anchor: schema.organizations.billingAnchorAt,
      createdAt: schema.organizations.createdAt,
    })
    .from(schema.organizations)
    .leftJoin(schema.plans, eq(schema.plans.id, schema.organizations.planId))
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  const row = rows[0];
  const anchor = row?.anchor ?? row?.createdAt ?? now;

  // Backfills the anchor once, so the cycle stays stable from then on.
  if (row && !row.anchor) {
    await db
      .update(schema.organizations)
      .set({ billingAnchorAt: anchor })
      .where(eq(schema.organizations.id, organizationId));
  }

  return {
    organizationId,
    planName: row?.planName ?? null,
    unitPriceCents: row?.unitOverride ?? row?.planUnit ?? 0,
    cycle: resolveCycle(anchor, now),
  };
}

/**
 * Makes sure every screen active right now has its prorated charge for the
 * current cycle. Idempotent: the unique index keeps one charge per screen/cycle.
 */
export async function accrueCycleCharges(organizationId: string, now = new Date()) {
  const ctx = await getBillingContext(organizationId, now);
  if (ctx.unitPriceCents <= 0) return ctx;

  const db = getDb();
  const devices = await db
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
      ),
    );

  for (const device of devices) {
    // A screen linked mid-cycle only pays from its link day onwards.
    const from = startOfDay(device.createdAt) > ctx.cycle.start
      ? startOfDay(device.createdAt)
      : ctx.cycle.start;
    const days = wholeDays(from, ctx.cycle.end);
    await db
      .insert(schema.billingEntries)
      .values({
        organizationId,
        deviceId: device.id,
        deviceName: device.name,
        kind: "charge",
        periodStart: ctx.cycle.start,
        periodEnd: ctx.cycle.end,
        chargedFrom: from,
        days,
        cycleDays: ctx.cycle.cycleDays,
        unitPriceCents: ctx.unitPriceCents,
        amountCents: prorate(ctx.unitPriceCents, days, ctx.cycle.cycleDays),
      })
      .onConflictDoNothing();
  }

  return ctx;
}

/**
 * Charges a screen that was just linked, for the days left until the renewal
 * date. Called right after a successful pairing.
 */
export async function chargeDeviceActivation(
  organizationId: string,
  deviceId: string,
  deviceName: string,
  now = new Date(),
) {
  const ctx = await getBillingContext(organizationId, now);
  if (ctx.unitPriceCents <= 0) return;

  const from = startOfDay(now) > ctx.cycle.start ? startOfDay(now) : ctx.cycle.start;
  const days = wholeDays(from, ctx.cycle.end);

  await getDb()
    .insert(schema.billingEntries)
    .values({
      organizationId,
      deviceId,
      deviceName,
      kind: "charge",
      periodStart: ctx.cycle.start,
      periodEnd: ctx.cycle.end,
      chargedFrom: from,
      days,
      cycleDays: ctx.cycle.cycleDays,
      unitPriceCents: ctx.unitPriceCents,
      amountCents: prorate(ctx.unitPriceCents, days, ctx.cycle.cycleDays),
    })
    .onConflictDoNothing();
}

/**
 * Credits back the unused days of a screen removed mid-cycle. The credit can
 * never exceed what was actually charged for that screen in the cycle.
 */
export async function creditDeviceRemoval(
  organizationId: string,
  deviceId: string,
  deviceName: string,
  now = new Date(),
) {
  const ctx = await getBillingContext(organizationId, now);
  if (ctx.unitPriceCents <= 0) return;

  const db = getDb();
  const charges = await db
    .select({ amountCents: schema.billingEntries.amountCents })
    .from(schema.billingEntries)
    .where(
      and(
        eq(schema.billingEntries.organizationId, organizationId),
        eq(schema.billingEntries.deviceId, deviceId),
        eq(schema.billingEntries.periodStart, ctx.cycle.start),
        eq(schema.billingEntries.kind, "charge"),
      ),
    )
    .limit(1);

  const charged = charges[0]?.amountCents ?? 0;
  if (charged <= 0) return;

  const unusedDays = wholeDays(startOfDay(now), ctx.cycle.end);
  const credit = Math.min(charged, prorate(ctx.unitPriceCents, unusedDays, ctx.cycle.cycleDays));
  if (credit <= 0) return;

  await db
    .insert(schema.billingEntries)
    .values({
      organizationId,
      deviceId,
      deviceName,
      kind: "credit",
      periodStart: ctx.cycle.start,
      periodEnd: ctx.cycle.end,
      chargedFrom: startOfDay(now),
      days: unusedDays,
      cycleDays: ctx.cycle.cycleDays,
      unitPriceCents: ctx.unitPriceCents,
      amountCents: -credit,
    })
    .onConflictDoNothing();
}

/** Everything the invoice screen (and the Torre) needs for one account. */
export async function getBillingSummary(
  organizationId: string,
  now = new Date(),
): Promise<BillingSummary> {
  const ctx = await accrueCycleCharges(organizationId, now);
  const db = getDb();

  const [{ devices = 0 } = { devices: 0 }] = await db
    .select({ devices: sql<number>`count(*)::int` })
    .from(schema.devices)
    .where(
      and(eq(schema.devices.organizationId, organizationId), eq(schema.devices.status, "active")),
    );

  const rows = await db
    .select()
    .from(schema.billingEntries)
    .where(
      and(
        eq(schema.billingEntries.organizationId, organizationId),
        gte(schema.billingEntries.periodStart, ctx.cycle.start),
      ),
    )
    .orderBy(schema.billingEntries.createdAt);

  let chargesCents = 0;
  let creditsCents = 0;
  for (const row of rows) {
    if (row.amountCents >= 0) chargesCents += row.amountCents;
    else creditsCents += row.amountCents;
  }

  const activeDevices = Number(devices ?? 0);

  return {
    planName: ctx.planName,
    unitPriceCents: ctx.unitPriceCents,
    perDeviceBilling: ctx.unitPriceCents > 0,
    activeDevices,
    cycleStart: ctx.cycle.start.toISOString(),
    cycleEnd: ctx.cycle.end.toISOString(),
    cycleDays: ctx.cycle.cycleDays,
    daysRemaining: wholeDays(startOfDay(now), ctx.cycle.end),
    recurringCents: ctx.unitPriceCents * activeDevices,
    chargesCents,
    creditsCents,
    totalCents: Math.max(0, chargesCents + creditsCents),
    entries: rows.map((row) => ({
      id: row.id,
      deviceId: row.deviceId,
      deviceName: row.deviceName,
      kind: row.amountCents >= 0 ? "charge" : "credit",
      chargedFrom: row.chargedFrom.toISOString(),
      days: row.days,
      cycleDays: row.cycleDays,
      unitPriceCents: row.unitPriceCents,
      amountCents: row.amountCents,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
