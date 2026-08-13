import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";

/** Billing is opt-in, so only explicitly enabled and suspended accounts are blocked. */
export async function isOrganizationServiceSuspended(organizationId: string | null) {
  if (!organizationId) return false;
  const [organization] = await getDb()
    .select({
      billingEnabled: schema.organizations.billingEnabled,
      subscriptionStatus: schema.organizations.subscriptionStatus,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);
  return Boolean(organization?.billingEnabled && organization.subscriptionStatus === "suspended");
}

export function suspendedServiceResponse() {
  return Response.json(
    { error: "Serviço temporariamente suspenso.", suspended: true },
    { status: 402, headers: { "cache-control": "no-store" } },
  );
}
