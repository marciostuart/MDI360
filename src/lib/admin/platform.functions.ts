import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Platform staff are defined by PLATFORM_ADMIN_EMAILS (comma separated) on the
 * server. Tenant roles (owner/admin/operator) never grant platform access.
 */
function isPlatformEmail(email: string) {
  const allow = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

export type PlatformOverview = {
  organizations: number;
  users: number;
  /** Screens actually linked to a customer — never counts unclaimed rows. */
  linkedDevices: number;
  onlineDevices: number;
  pendingDevices: number;
  storageBytes: number;
  mediaAssets: number;
  requests24h: number;
  traffic24hBytes: number;
};

export type InfraStatus = {
  databaseReady: boolean;
  schemaReady: boolean;
  storageReady: boolean;
  storageError: string | null;
};

/** Returns null when the caller is not platform staff — the UI shows a 404-ish state. */
export const fetchPlatformOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlatformOverview | null> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return null;

    const { getSessionUser } = await import("@/lib/auth/session.server");
    const { count, and, eq, isNotNull, gt, sql } = await import("drizzle-orm");

    try {
      const user = await getSessionUser();
      if (!user || !isPlatformEmail(user.email)) return null;

      const db = getDb();
      const [orgs] = await db.select({ value: count() }).from(schema.organizations);
      const [users] = await db.select({ value: count() }).from(schema.users);
      const [linked] = await db
        .select({ value: count() })
        .from(schema.devices)
        .where(and(isNotNull(schema.devices.organizationId), eq(schema.devices.status, "active")));
      const [online] = await db
        .select({ value: count() })
        .from(schema.devices)
        .where(
          and(
            isNotNull(schema.devices.organizationId),
            eq(schema.devices.status, "active"),
            gt(schema.devices.lastSeenAt, new Date(Date.now() - 90_000)),
          ),
        );
      const [pending] = await db
        .select({ value: count() })
        .from(schema.devices)
        .where(eq(schema.devices.status, "pending"));
      const [media] = await db
        .select({
          value: count(),
          bytes: sql<number>`coalesce(sum(${schema.mediaAssets.byteSize}), 0)::bigint`,
        })
        .from(schema.mediaAssets);

      let requests24h = 0;
      let traffic24hBytes = 0;
      try {
        const [traffic] = await db
          .select({
            requests: sql<number>`coalesce(sum(${schema.trafficHourly.requests}), 0)::bigint`,
            bytes: sql<number>`coalesce(sum(${schema.trafficHourly.bytesIn} + ${schema.trafficHourly.bytesOut}), 0)::bigint`,
          })
          .from(schema.trafficHourly)
          .where(gt(schema.trafficHourly.bucket, new Date(Date.now() - 24 * 3600_000)));
        requests24h = Number(traffic?.requests ?? 0);
        traffic24hBytes = Number(traffic?.bytes ?? 0);
      } catch {
        requests24h = 0;
      }

      return {
        organizations: orgs?.value ?? 0,
        users: users?.value ?? 0,
        linkedDevices: linked?.value ?? 0,
        onlineDevices: online?.value ?? 0,
        pendingDevices: pending?.value ?? 0,
        storageBytes: Number(media?.bytes ?? 0),
        mediaAssets: media?.value ?? 0,
        requests24h,
        traffic24hBytes,
      };
    } catch (error) {
      console.error("fetchPlatformOverview failed", error);
      return null;
    }
  },
);

/**
 * Infrastructure health (Postgres + MinIO). Platform staff only: the storage
 * error text can reveal endpoints and credentials problems, so customers must
 * never see it. Returns null for everyone else.
 */
export const fetchInfraStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<InfraStatus | null> => {
    const { isDatabaseConfigured } = await import("@/lib/db/index.server");
    const { getSessionUser } = await import("@/lib/auth/session.server");

    if (!isDatabaseConfigured()) return null;

    let user: Awaited<ReturnType<typeof getSessionUser>> = null;
    try {
      user = await getSessionUser();
    } catch {
      return null;
    }
    if (!user || !isPlatformEmail(user.email)) return null;

    let schemaReady = false;
    try {
      const { getDb, schema } = await import("@/lib/db/index.server");
      await getDb().select({ id: schema.users.id }).from(schema.users).limit(1);
      schemaReady = true;
    } catch {
      schemaReady = false;
    }

    const { checkStorageConnection } = await import("@/lib/storage.server");
    const storage = await checkStorageConnection();

    return {
      databaseReady: true,
      schemaReady,
      storageReady: storage.ok,
      storageError: storage.error ?? null,
    };
  },
);
/* ------------------------------------------------------------------ */
/* Full platform control (clients, plans, impersonation, traffic)       */
/* ------------------------------------------------------------------ */

async function requirePlatform() {
  const { getSessionUser, getImpersonatorUser } = await import("@/lib/auth/session.server");
  const current = await getSessionUser();
  const user = current && isPlatformEmail(current.email) ? current : await getImpersonatorUser();
  if (!user || !isPlatformEmail(user.email)) throw new Error("FORBIDDEN");
  return user;
}

export type PlatformOrganization = {
  id: string;
  name: string;
  slug: string;
  planId: string | null;
  planName: string | null;
  subscriptionStatus: string;
  subscriptionExpiresAt: string | null;
  billingEnabled: boolean;
  billingClosingDay: number | null;
  billingPendingClosingDay: number | null;
  billingActivatedAt: string | null;
  maxDevices: number;
  maxStorageMb: number;
  /** Raw override value stored in the database. Null when the plan limit applies. */
  deviceLimitOverride: number | null;
  storageLimitMbOverride: number | null;
  linkedDevices: number;
  onlineDevices: number;
  pendingDevices: number;
  users: number;
  mediaCount: number;
  storageBytes: number;
  createdAt: string;
  ownerEmail: string | null;
};

async function loadPlatformOrganizations(): Promise<PlatformOrganization[]> {
  const { getDb, schema } = await import("@/lib/db/index.server");
  const { sql, eq } = await import("drizzle-orm");
  const rows = await getDb()
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
      planId: schema.organizations.planId,
      planName: schema.plans.name,
      planDevices: schema.plans.maxDevices,
      planStorage: schema.plans.maxStorageMb,
      deviceOverride: schema.organizations.deviceLimitOverride,
      storageOverride: schema.organizations.storageLimitMbOverride,
      status: schema.organizations.subscriptionStatus,
      expiresAt: schema.organizations.subscriptionExpiresAt,
      billingEnabled: schema.organizations.billingEnabled,
      billingClosingDay: schema.organizations.billingClosingDay,
      billingPendingClosingDay: schema.organizations.billingPendingClosingDay,
      billingActivatedAt: schema.organizations.billingActivatedAt,
      createdAt: schema.organizations.createdAt,
      linkedDevices: sql<number>`(
        select count(*)::int from devices d
        where d.organization_id = organizations.id and d.status = 'active'
      )`,
      onlineDevices: sql<number>`(
        select count(*)::int from devices d
        where d.organization_id = organizations.id and d.status = 'active'
          and d.last_seen_at > now() - interval '90 seconds'
      )`,
      pendingDevices: sql<number>`(
        select count(*)::int from devices d
        where d.organization_id = organizations.id and d.status <> 'active'
      )`,
      users: sql<number>`(
        select count(*)::int from users u where u.organization_id = organizations.id
      )`,
      mediaCount: sql<number>`(
        select count(*)::int from media_assets m where m.organization_id = organizations.id
      )`,
      storageBytes: sql<number>`(
        select coalesce(sum(m.byte_size), 0)::bigint from media_assets m
        where m.organization_id = organizations.id
      )`,
      ownerEmail: sql<string | null>`(
        select u.email from users u where u.organization_id = organizations.id
        order by u.created_at asc limit 1
      )`,
    })
    .from(schema.organizations)
    .leftJoin(schema.plans, eq(schema.plans.id, schema.organizations.planId))
    .orderBy(schema.organizations.createdAt);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    planId: row.planId,
    planName: row.planName,
    subscriptionStatus: row.status,
    subscriptionExpiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    billingEnabled: row.billingEnabled,
    billingClosingDay: row.billingClosingDay,
    billingPendingClosingDay: row.billingPendingClosingDay,
    billingActivatedAt: row.billingActivatedAt ? row.billingActivatedAt.toISOString() : null,
    maxDevices: row.deviceOverride ?? row.planDevices ?? 3,
    maxStorageMb: row.storageOverride ?? row.planStorage ?? 2048,
    deviceLimitOverride: row.deviceOverride ?? null,
    storageLimitMbOverride: row.storageOverride ?? null,
    linkedDevices: Number(row.linkedDevices ?? 0),
    onlineDevices: Number(row.onlineDevices ?? 0),
    pendingDevices: Number(row.pendingDevices ?? 0),
    users: Number(row.users ?? 0),
    mediaCount: Number(row.mediaCount ?? 0),
    storageBytes: Number(row.storageBytes ?? 0),
    createdAt: row.createdAt.toISOString(),
    ownerEmail: row.ownerEmail ?? null,
  }));
}

/** Every customer account with the metrics the platform team bills on. */
export const fetchPlatformOrganizations = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlatformOrganization[] | null> => {
    const { isDatabaseConfigured } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return null;

    try {
      await requirePlatform();
      return await loadPlatformOrganizations();
    } catch (error) {
      console.error("fetchPlatformOrganizations failed", error);
      return null;
    }
  },
);

export type PlatformOrgDetail = {
  organization: PlatformOrganization;
  notes: string | null;
  users: { id: string; name: string; email: string; lastLoginAt: string | null }[];
  devices: {
    id: string;
    name: string;
    status: string;
    online: boolean;
    lastSeenAt: string | null;
    appVersion: string | null;
  }[];
  topMedia: { id: string; name: string; kind: string; byteSize: number }[];
  billing: {
    openInvoices: number;
    overdueInvoices: number;
    outstandingCents: number;
    lastInvoiceAt: string | null;
    invoices: { id: string; number: string; status: string; totalCents: number; dueAt: string }[];
    items: { id: string; invoiceId: string; description: string; amountCents: number }[];
    attempts: {
      id: string;
      method: string;
      status: string;
      amountCents: number;
      createdAt: string;
    }[];
    notifications: {
      id: string;
      invoiceId: string;
      kind: string;
      status: string;
      attempts: number;
      error: string | null;
      createdAt: string;
    }[];
    credits: {
      id: string;
      amountCents: number;
      remainingCents: number;
      reason: string;
      createdAt: string;
    }[];
  };
};

export const fetchOrganizationDetail = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<PlatformOrgDetail | null> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return null;

    try {
      await requirePlatform();
      const { eq, desc, inArray, sql } = await import("drizzle-orm");
      const db = getDb();

      const list = await loadPlatformOrganizations();
      const organization = list.find((item) => item.id === data.organizationId);
      if (!organization) return null;

      const [notesRow] = await db
        .select({ notes: schema.organizations.adminNotes })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, data.organizationId))
        .limit(1);

      const users = await db
        .select({
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
          lastLoginAt: schema.users.lastLoginAt,
        })
        .from(schema.users)
        .where(eq(schema.users.organizationId, data.organizationId))
        .limit(50);

      const devices = await db
        .select({
          id: schema.devices.id,
          name: schema.devices.name,
          status: schema.devices.status,
          lastSeenAt: schema.devices.lastSeenAt,
          appVersion: schema.devices.appVersion,
        })
        .from(schema.devices)
        .where(eq(schema.devices.organizationId, data.organizationId))
        .limit(200);

      const topMedia = await db
        .select({
          id: schema.mediaAssets.id,
          name: schema.mediaAssets.name,
          kind: schema.mediaAssets.kind,
          byteSize: schema.mediaAssets.byteSize,
        })
        .from(schema.mediaAssets)
        .where(eq(schema.mediaAssets.organizationId, data.organizationId))
        .orderBy(desc(schema.mediaAssets.byteSize))
        .limit(10);

      const [billing] = await db
        .select({
          openInvoices: sql<number>`count(*) filter (where ${schema.billingInvoices.status} = 'open')::int`,
          overdueInvoices: sql<number>`count(*) filter (where ${schema.billingInvoices.status} = 'overdue')::int`,
          outstandingCents: sql<number>`coalesce(sum(${schema.billingInvoices.totalCents}) filter (where ${schema.billingInvoices.status} in ('open', 'overdue')), 0)::int`,
          lastInvoiceAt: sql<Date | null>`max(${schema.billingInvoices.closedAt})`,
        })
        .from(schema.billingInvoices)
        .where(eq(schema.billingInvoices.organizationId, data.organizationId));
      const invoices = await db
        .select({
          id: schema.billingInvoices.id,
          number: schema.billingInvoices.number,
          status: schema.billingInvoices.status,
          totalCents: schema.billingInvoices.totalCents,
          dueAt: schema.billingInvoices.dueAt,
        })
        .from(schema.billingInvoices)
        .where(eq(schema.billingInvoices.organizationId, data.organizationId))
        .orderBy(desc(schema.billingInvoices.createdAt))
        .limit(12);
      const invoiceIds = invoices.map((invoice) => invoice.id);
      const items = invoiceIds.length
        ? await db
            .select({
              id: schema.billingInvoiceItems.id,
              invoiceId: schema.billingInvoiceItems.invoiceId,
              description: schema.billingInvoiceItems.description,
              amountCents: schema.billingInvoiceItems.amountCents,
            })
            .from(schema.billingInvoiceItems)
            .where(inArray(schema.billingInvoiceItems.invoiceId, invoiceIds))
            .orderBy(schema.billingInvoiceItems.createdAt)
        : [];
      const attempts = await db
        .select({
          id: schema.billingPaymentAttempts.id,
          method: schema.billingPaymentAttempts.method,
          status: schema.billingPaymentAttempts.status,
          amountCents: schema.billingPaymentAttempts.amountCents,
          createdAt: schema.billingPaymentAttempts.createdAt,
        })
        .from(schema.billingPaymentAttempts)
        .where(eq(schema.billingPaymentAttempts.organizationId, data.organizationId))
        .orderBy(desc(schema.billingPaymentAttempts.createdAt))
        .limit(12);
      const notifications = await db
        .select({
          id: schema.billingNotifications.id,
          invoiceId: schema.billingNotifications.invoiceId,
          kind: schema.billingNotifications.kind,
          status: schema.billingNotifications.status,
          attempts: schema.billingNotifications.attempts,
          error: schema.billingNotifications.error,
          createdAt: schema.billingNotifications.createdAt,
        })
        .from(schema.billingNotifications)
        .where(eq(schema.billingNotifications.organizationId, data.organizationId))
        .orderBy(desc(schema.billingNotifications.createdAt))
        .limit(20);
      const credits = await db
        .select({
          id: schema.billingCredits.id,
          amountCents: schema.billingCredits.amountCents,
          remainingCents: schema.billingCredits.remainingCents,
          reason: schema.billingCredits.reason,
          createdAt: schema.billingCredits.createdAt,
        })
        .from(schema.billingCredits)
        .where(eq(schema.billingCredits.organizationId, data.organizationId))
        .orderBy(desc(schema.billingCredits.createdAt))
        .limit(20);

      const now = Date.now();
      return {
        organization,
        notes: notesRow?.notes ?? null,
        users: users.map((u) => ({
          ...u,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        })),
        devices: devices.map((d) => ({
          id: d.id,
          name: d.name,
          status: d.status,
          online: d.lastSeenAt ? now - d.lastSeenAt.getTime() < 90_000 : false,
          lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
          appVersion: d.appVersion,
        })),
        topMedia: topMedia.map((m) => ({
          id: m.id,
          name: m.name,
          kind: m.kind,
          byteSize: Number(m.byteSize ?? 0),
        })),
        billing: {
          openInvoices: Number(billing?.openInvoices ?? 0),
          overdueInvoices: Number(billing?.overdueInvoices ?? 0),
          outstandingCents: Number(billing?.outstandingCents ?? 0),
          lastInvoiceAt: billing?.lastInvoiceAt?.toISOString() ?? null,
          invoices: invoices.map((invoice) => ({ ...invoice, dueAt: invoice.dueAt.toISOString() })),
          items,
          attempts: attempts.map((attempt) => ({
            ...attempt,
            createdAt: attempt.createdAt.toISOString(),
          })),
          notifications: notifications.map((notification) => ({
            ...notification,
            createdAt: notification.createdAt.toISOString(),
          })),
          credits: credits.map((credit) => ({
            ...credit,
            createdAt: credit.createdAt.toISOString(),
          })),
        },
      };
    } catch (error) {
      console.error("fetchOrganizationDetail failed", error);
      return null;
    }
  });

export type PlatformPlan = {
  id: string;
  name: string;
  slug: string;
  maxDevices: number;
  maxStorageMb: number;
  priceCents: number;
  /** Monthly price of each active screen (per-seat billing). */
  pricePerDeviceCents: number;
  queueEnabled: boolean;
  isActive: boolean;
  organizations: number;
  createdAt: string;
};

export const fetchPlans = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlatformPlan[] | null> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return null;
    try {
      await requirePlatform();
      const { sql } = await import("drizzle-orm");
      const rows = await getDb()
        .select({
          id: schema.plans.id,
          name: schema.plans.name,
          slug: schema.plans.slug,
          maxDevices: schema.plans.maxDevices,
          maxStorageMb: schema.plans.maxStorageMb,
          priceCents: schema.plans.priceCents,
          pricePerDeviceCents: schema.plans.pricePerDeviceCents,
          queueEnabled: schema.plans.queueEnabled,
          isActive: schema.plans.isActive,
          createdAt: schema.plans.createdAt,
          organizations: sql<number>`(
            select count(*)::int from organizations o where o.plan_id = plans.id
          )`,
        })
        .from(schema.plans)
        .orderBy(schema.plans.priceCents);
      return rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        organizations: Number(row.organizations ?? 0),
      }));
    } catch (error) {
      console.error("fetchPlans failed", error);
      return null;
    }
  },
);

const planSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,40}$/, "Use apenas letras minúsculas, números e hífen"),
  maxDevices: z.number().int().min(1).max(10000),
  maxStorageMb: z.number().int().min(64).max(10_000_000),
  priceCents: z.number().int().min(0).max(100_000_000),
  pricePerDeviceCents: z.number().int().min(0).max(100_000_000).default(0),
  queueEnabled: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const savePlan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => planSchema.parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    await requirePlatform();
    const { eq } = await import("drizzle-orm");
    const db = getDb();

    if (data.id) {
      await db
        .update(schema.plans)
        .set({
          name: data.name,
          slug: data.slug,
          maxDevices: data.maxDevices,
          maxStorageMb: data.maxStorageMb,
          priceCents: data.priceCents,
          pricePerDeviceCents: data.pricePerDeviceCents,
          queueEnabled: data.queueEnabled,
          isActive: data.isActive,
        })
        .where(eq(schema.plans.id, data.id));
      return { ok: true, id: data.id };
    }

    const inserted = await db
      .insert(schema.plans)
      .values({
        name: data.name,
        slug: data.slug,
        maxDevices: data.maxDevices,
        maxStorageMb: data.maxStorageMb,
        priceCents: data.priceCents,
        pricePerDeviceCents: data.pricePerDeviceCents,
        queueEnabled: data.queueEnabled,
        isActive: data.isActive,
      })
      .returning({ id: schema.plans.id });
    return { ok: true, id: inserted[0]!.id };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    await requirePlatform();
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    await db
      .update(schema.organizations)
      .set({ planId: null })
      .where(eq(schema.organizations.planId, data.planId));
    await db.delete(schema.plans).where(eq(schema.plans.id, data.planId));
    return { ok: true };
  });

export const updateOrganizationSubscription = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        planId: z.string().uuid().nullable().optional(),
        subscriptionStatus: z.enum(["trial", "active", "past_due", "suspended", "canceled"]),
        subscriptionExpiresAt: z.string().trim().max(40).nullable().optional(),
        deviceLimitOverride: z.number().int().min(0).max(10000).nullable().optional(),
        storageLimitMbOverride: z.number().int().min(0).max(10_000_000).nullable().optional(),
        notes: z.string().trim().max(2000).nullable().optional(),
        billingEnabled: z.boolean().default(false),
        billingClosingDay: z
          .union([z.literal(1), z.literal(5), z.literal(10), z.literal(15), z.literal(20)])
          .nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const actor = await requirePlatform();
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    const [before] = await db
      .select({ billingEnabled: schema.organizations.billingEnabled })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, data.organizationId))
      .limit(1);
    const activating = data.billingEnabled && !before?.billingEnabled;

    await db.transaction(async (tx) => {
      await tx
        .update(schema.organizations)
        .set({
          planId: data.planId ?? null,
          subscriptionStatus: data.subscriptionStatus,
          subscriptionExpiresAt: data.subscriptionExpiresAt
            ? new Date(data.subscriptionExpiresAt)
            : null,
          deviceLimitOverride: data.deviceLimitOverride ?? null,
          storageLimitMbOverride: data.storageLimitMbOverride ?? null,
          adminNotes: data.notes ?? null,
          billingEnabled: data.billingEnabled,
          billingClosingDay: data.billingClosingDay,
          billingActivatedAt: activating ? new Date() : undefined,
          billingSuspendedAt: data.billingEnabled ? undefined : null,
        })
        .where(eq(schema.organizations.id, data.organizationId));
      await tx.insert(schema.billingAuditLogs).values({
        organizationId: data.organizationId,
        actorUserId: actor.id,
        action: activating
          ? "billing_enabled"
          : data.billingEnabled
            ? "billing_settings_updated"
            : "billing_disabled",
        details: {
          closingDay: data.billingClosingDay,
          subscriptionStatus: data.subscriptionStatus,
        },
      });
    });

    return { ok: true };
  });

export const resendBillingNotice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ invoiceId: z.string().uuid(), kind: z.enum(["closing", "due"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requirePlatform();
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    const [invoice] = await db
      .select({ organizationId: schema.billingInvoices.organizationId })
      .from(schema.billingInvoices)
      .where(eq(schema.billingInvoices.id, data.invoiceId))
      .limit(1);
    if (!invoice) throw new Error("NOT_FOUND");
    await db
      .insert(schema.billingNotifications)
      .values({
        organizationId: invoice.organizationId,
        invoiceId: data.invoiceId,
        kind: data.kind,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: [schema.billingNotifications.invoiceId, schema.billingNotifications.kind],
        set: {
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(),
          processingAt: null,
          error: null,
          sentAt: null,
        },
      });
    return { ok: true };
  });

export const markInvoicePaid = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const actor = await requirePlatform();
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { and, eq, inArray } = await import("drizzle-orm");
    const db = getDb();
    const [invoice] = await db
      .select({
        organizationId: schema.billingInvoices.organizationId,
        status: schema.billingInvoices.status,
      })
      .from(schema.billingInvoices)
      .where(eq(schema.billingInvoices.id, data.invoiceId))
      .limit(1);
    if (!invoice) throw new Error("NOT_FOUND");
    if (!(["open", "overdue"] as string[]).includes(invoice.status)) {
      return { ok: true, changed: false, reactivated: false };
    }

    let reactivated = false;
    await db.transaction(async (tx) => {
      await tx
        .update(schema.billingInvoices)
        .set({ status: "paid", paidAt: new Date() })
        .where(
          and(
            eq(schema.billingInvoices.id, data.invoiceId),
            inArray(schema.billingInvoices.status, ["open", "overdue"]),
          ),
        );
      await tx.insert(schema.billingAuditLogs).values({
        organizationId: invoice.organizationId,
        actorUserId: actor.id,
        action: "invoice_manually_paid",
        details: { invoiceId: data.invoiceId, previousStatus: invoice.status },
      });

      const [remaining] = await tx
        .select({ id: schema.billingInvoices.id })
        .from(schema.billingInvoices)
        .where(
          and(
            eq(schema.billingInvoices.organizationId, invoice.organizationId),
            eq(schema.billingInvoices.status, "overdue"),
          ),
        )
        .limit(1);
      const [organization] = await tx
        .select({
          billingEnabled: schema.organizations.billingEnabled,
          subscriptionStatus: schema.organizations.subscriptionStatus,
        })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, invoice.organizationId))
        .limit(1);
      reactivated = Boolean(
        !remaining &&
        organization?.billingEnabled &&
        organization.subscriptionStatus === "suspended",
      );
      if (reactivated) {
        await tx
          .update(schema.organizations)
          .set({ subscriptionStatus: "active", billingSuspendedAt: null })
          .where(eq(schema.organizations.id, invoice.organizationId));
      }
    });
    return { ok: true, changed: true, reactivated };
  });

export const reconcileOrganizationPayments = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await requirePlatform();
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { and, eq, inArray } = await import("drizzle-orm");
    const attempts = await getDb()
      .select({ id: schema.billingPaymentAttempts.id })
      .from(schema.billingPaymentAttempts)
      .where(
        and(
          eq(schema.billingPaymentAttempts.organizationId, data.organizationId),
          inArray(schema.billingPaymentAttempts.status, ["creating", "pending", "canceled"]),
        ),
      )
      .limit(50);
    const { reconcileAttempt } = await import("@/lib/billing/payments.server");
    let reconciled = 0;
    for (const attempt of attempts) {
      try {
        await reconcileAttempt(attempt.id);
        reconciled += 1;
      } catch {
        /* shown in attempt history */
      }
    }
    return { ok: true, reconciled };
  });

export const renameOrganization = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ organizationId: z.string().uuid(), name: z.string().trim().min(2).max(160) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    await requirePlatform();
    const { eq } = await import("drizzle-orm");
    await getDb()
      .update(schema.organizations)
      .set({ name: data.name })
      .where(eq(schema.organizations.id, data.organizationId));
    return { ok: true };
  });

/** Hard delete of a customer account and everything it owns. */
export const deleteOrganization = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    await requirePlatform();
    const { eq } = await import("drizzle-orm");

    // Storage first: the DB cascade would otherwise erase the only pointer to
    // the customer's objects and leave them orphaned (and still billable).
    const { isStorageConfigured, deleteObjectsByPrefix } = await import("@/lib/storage.server");
    if (isStorageConfigured()) {
      try {
        await deleteObjectsByPrefix(`org/${data.organizationId}/`);
      } catch (error) {
        console.error("failed to purge organization storage", error);
        return { ok: false, message: "Não foi possível remover as mídias do armazenamento." };
      }
    }

    await getDb()
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, data.organizationId));
    return { ok: true };
  });

/** Signs the platform admin in as the first user of the account. */
export const impersonateOrganization = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    await requirePlatform();
    const { and, eq } = await import("drizzle-orm");

    const rows = await getDb()
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(eq(schema.users.organizationId, data.organizationId), eq(schema.users.isActive, true)),
      )
      .orderBy(schema.users.createdAt)
      .limit(1);

    const target = rows[0];
    if (!target) return { ok: false, message: "Esta conta não possui usuário ativo." };

    const { startImpersonation } = await import("@/lib/auth/session.server");
    await startImpersonation(target.id);
    return { ok: true };
  });

export const endImpersonation = createServerFn({ method: "POST" }).handler(async () => {
  const { getImpersonatorUser, stopImpersonation } = await import("@/lib/auth/session.server");
  const original = await getImpersonatorUser();
  if (!original || !isPlatformEmail(original.email)) return { ok: false };
  return { ok: await stopImpersonation() };
});

export const fetchImpersonationState = createServerFn({ method: "GET" }).handler(async () => {
  const { isImpersonating } = await import("@/lib/auth/session.server");
  try {
    return { impersonating: isImpersonating() };
  } catch {
    return { impersonating: false };
  }
});

export type TrafficPoint = {
  bucket: string;
  requests: number;
  bytesIn: number;
  bytesOut: number;
};

/** Hourly server load for the last N hours (default 48). */
export const fetchTrafficSeries = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ hours: z.number().int().min(6).max(720).default(48) }).parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<TrafficPoint[] | null> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return null;
    try {
      await requirePlatform();
      const { gte, asc } = await import("drizzle-orm");
      const since = new Date(Date.now() - data.hours * 3600_000);
      const rows = await getDb()
        .select()
        .from(schema.trafficHourly)
        .where(gte(schema.trafficHourly.bucket, since))
        .orderBy(asc(schema.trafficHourly.bucket));
      return rows.map((row) => ({
        bucket: row.bucket.toISOString(),
        requests: Number(row.requests ?? 0),
        bytesIn: Number(row.bytesIn ?? 0),
        bytesOut: Number(row.bytesOut ?? 0),
      }));
    } catch (error) {
      console.error("fetchTrafficSeries failed", error);
      return null;
    }
  });

export type LiveTrafficSample = {
  at: number;
  requests: number;
  bytes: number;
  uptimeMs: number;
};

/**
 * Live traffic counters read straight from the server's memory — zero database
 * work, so the dashboard can poll it once per second and compute per-second
 * resolution by diffing consecutive samples.
 */
export const fetchLiveTraffic = createServerFn({ method: "GET" }).handler(
  async (): Promise<LiveTrafficSample | null> => {
    try {
      await requirePlatform();
      const { readTrafficCounters } = await import("@/lib/admin/traffic.server");
      const counters = readTrafficCounters();
      return {
        at: counters.at,
        requests: counters.requests,
        bytes: counters.bytes,
        uptimeMs: counters.uptimeMs,
      };
    } catch {
      return null;
    }
  },
);

export type PendingDevice = {
  id: string;
  pairingCode: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
};

/** Screens that generated an activation code and were never claimed. */
export const fetchPendingDevices = createServerFn({ method: "GET" }).handler(
  async (): Promise<PendingDevice[]> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return [];
    try {
      await requirePlatform();
      const { isNull, desc } = await import("drizzle-orm");
      const rows = await getDb()
        .select({
          id: schema.devices.id,
          pairingCode: schema.devices.pairingCode,
          createdAt: schema.devices.createdAt,
          lastSeenAt: schema.devices.lastSeenAt,
        })
        .from(schema.devices)
        .where(isNull(schema.devices.organizationId))
        .orderBy(desc(schema.devices.createdAt))
        .limit(200);
      return rows.map((row) => ({
        id: row.id,
        pairingCode: row.pairingCode,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
        lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
      }));
    } catch {
      return [];
    }
  },
);

/**
 * Releases stuck activation codes. Deleting an unclaimed row frees its code and
 * makes the TV register again in seconds (its token stops working, so the app
 * wipes the local state and asks for a new code). Never touches linked screens.
 */
export const resetPendingDevices = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        // Empty/undefined = release every unclaimed code.
        code: z
          .string()
          .trim()
          .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
          .optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; removed: number; message?: string }> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return { ok: false, removed: 0, message: "Banco indisponível." };

    await requirePlatform();
    const { and, eq, isNull } = await import("drizzle-orm");
    const db = getDb();

    const where = data.code
      ? and(isNull(schema.devices.organizationId), eq(schema.devices.pairingCode, data.code))
      : isNull(schema.devices.organizationId);

    const removed = await db.delete(schema.devices).where(where).returning({
      id: schema.devices.id,
    });

    // Wakes any TV still holding an open connection so it re-registers now.
    const { notifyDevice } = await import("@/lib/player/realtime.server");
    for (const row of removed) notifyDevice(row.id);

    if (data.code && removed.length === 0) {
      return {
        ok: false,
        removed: 0,
        message: "Código não encontrado entre as telas aguardando vínculo.",
      };
    }
    return { ok: true, removed: removed.length };
  });
