import { createServerFn } from "@tanstack/react-start";

export type PlanFeatures = {
  planName: string | null;
  maxDevices: number;
  maxStorageMb: number;
  queueEnabled: boolean;
};

/** Plan limits/features of the caller's own organization (customer safe). */
export const fetchPlanFeatures = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlanFeatures | null> => {
    const { isDatabaseConfigured } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return null;
    try {
      const { requireUser } = await import("@/lib/auth/session.server");
      const { getOrgLimits } = await import("@/lib/admin/limits.server");
      const user = await requireUser();
      const limits = await getOrgLimits(user.organizationId);
      return {
        planName: limits.planName,
        maxDevices: limits.maxDevices,
        maxStorageMb: limits.maxStorageMb,
        queueEnabled: limits.queueEnabled,
      };
    } catch (error) {
      console.error("fetchPlanFeatures failed", error);
      return null;
    }
  },
);
