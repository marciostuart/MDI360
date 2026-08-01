import { createServerFn } from "@tanstack/react-start";

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
      const user = await requireUser();
      return await getBillingSummary(user.organizationId);
    } catch (error) {
      console.error("fetchBilling failed", error);
      return null;
    }
  },
);
