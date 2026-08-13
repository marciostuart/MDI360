export const BILLING_CLOSING_DAYS = [1, 5, 10, 15, 20] as const;
export type BillingClosingDay = (typeof BILLING_CLOSING_DAYS)[number];

const DAY_MS = 86_400_000;
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

export function isBillingClosingDay(value: number): value is BillingClosingDay {
  return BILLING_CLOSING_DAYS.includes(value as BillingClosingDay);
}

/** Midnight in Sao Paulo represented as a UTC Date (Brazil has no DST since 2019). */
export function saoPauloMidnight(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day) + SAO_PAULO_OFFSET_MS);
}

export function saoPauloParts(date: Date) {
  const local = new Date(date.getTime() - SAO_PAULO_OFFSET_MS);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
  };
}

export function closingAt(year: number, month: number, closingDay: BillingClosingDay) {
  return saoPauloMidnight(year, month, closingDay);
}

export function previousClosingAt(reference: Date, closingDay: BillingClosingDay) {
  const parts = saoPauloParts(reference);
  const current = closingAt(parts.year, parts.month, closingDay);
  return reference >= current
    ? current
    : closingAt(parts.year, parts.month - 1, closingDay);
}

export function nextClosingAt(reference: Date, closingDay: BillingClosingDay) {
  const parts = saoPauloParts(reference);
  const current = closingAt(parts.year, parts.month, closingDay);
  return reference < current
    ? current
    : closingAt(parts.year, parts.month + 1, closingDay);
}

/** Invoice remains payable throughout the fifth local day after closing. */
export function dueAtForClosing(closing: Date) {
  return new Date(closing.getTime() + 6 * DAY_MS - 1);
}

export function cycleDays(start: Date, end: Date) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}

export function currentPostpaidCycle(
  activatedAt: Date,
  closingDay: BillingClosingDay,
  now = new Date(),
) {
  const end = nextClosingAt(now, closingDay);
  const regularStart = previousClosingAt(new Date(end.getTime() - 1), closingDay);
  const start = activatedAt > regularStart ? activatedAt : regularStart;
  return { start, end, cycleDays: cycleDays(start, end) };
}

export function firstUnclosedPeriod(
  activatedAt: Date,
  closingDay: BillingClosingDay,
  lastPeriodEnd?: Date | null,
) {
  const start = lastPeriodEnd ?? activatedAt;
  const end = nextClosingAt(start, closingDay);
  return { start, end, cycleDays: cycleDays(start, end) };
}
