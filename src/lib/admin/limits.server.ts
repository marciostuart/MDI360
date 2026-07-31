/**
 * Resolves the effective limits of an organization: plan values, unless the
 * platform team set a per-account override in the Torre de Controle.
 */
import { eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";

export type OrgLimits = {
  planName: string | null;
  maxDevices: number;
  maxStorageMb: number;
  usedDevices: number;
  usedStorageBytes: number;
  /** Whether the queue (senhas) add-on is included in the account's plan. */
  queueEnabled: boolean;
  subscriptionStatus: string;
  subscriptionExpiresAt: Date | null;
  expired: boolean;
};

export const DEFAULT_MAX_DEVICES = 3;
export const DEFAULT_MAX_STORAGE_MB = 2048;

export async function getOrgLimits(organizationId: string): Promise<OrgLimits> {
  const db = getDb();

  const rows = await db
    .select({
      planName: schema.plans.name,
      planDevices: schema.plans.maxDevices,
      planStorage: schema.plans.maxStorageMb,
      planQueue: schema.plans.queueEnabled,
      deviceOverride: schema.organizations.deviceLimitOverride,
      storageOverride: schema.organizations.storageLimitMbOverride,
      queueOverride: schema.organizations.queueEnabledOverride,
      status: schema.organizations.subscriptionStatus,
      expiresAt: schema.organizations.subscriptionExpiresAt,
    })
    .from(schema.organizations)
    .leftJoin(schema.plans, eq(schema.plans.id, schema.organizations.planId))
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  const row = rows[0];

  const [usage] = await db
    .select({
      devices: sql<number>`count(*) filter (where ${schema.devices.status} = 'active')::int`,
    })
    .from(schema.devices)
    .where(eq(schema.devices.organizationId, organizationId));

  const [storage] = await db
    .select({ bytes: sql<number>`coalesce(sum(${schema.mediaAssets.byteSize}), 0)::bigint` })
    .from(schema.mediaAssets)
    .where(eq(schema.mediaAssets.organizationId, organizationId));

  const expiresAt = row?.expiresAt ?? null;

  return {
    planName: row?.planName ?? null,
    maxDevices: row?.deviceOverride ?? row?.planDevices ?? DEFAULT_MAX_DEVICES,
    maxStorageMb: row?.storageOverride ?? row?.planStorage ?? DEFAULT_MAX_STORAGE_MB,
    usedDevices: Number(usage?.devices ?? 0),
    usedStorageBytes: Number(storage?.bytes ?? 0),
    queueEnabled: row?.queueOverride ?? row?.planQueue ?? true,
    subscriptionStatus: row?.status ?? "trial",
    subscriptionExpiresAt: expiresAt,
    expired: Boolean(expiresAt && expiresAt.getTime() < Date.now()),
  };
}
