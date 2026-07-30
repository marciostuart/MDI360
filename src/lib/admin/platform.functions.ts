import { createServerFn } from "@tanstack/react-start";

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
  devices: number;
  activeDevices: number;
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
    const { count, eq } = await import("drizzle-orm");

    try {
      const user = await getSessionUser();
      if (!user || !isPlatformEmail(user.email)) return null;

      const db = getDb();
      const [orgs] = await db.select({ value: count() }).from(schema.organizations);
      const [users] = await db.select({ value: count() }).from(schema.users);
      const [devices] = await db.select({ value: count() }).from(schema.devices);
      const [active] = await db
        .select({ value: count() })
        .from(schema.devices)
        .where(eq(schema.devices.status, "active"));

      return {
        organizations: orgs?.value ?? 0,
        users: users?.value ?? 0,
        devices: devices?.value ?? 0,
        activeDevices: active?.value ?? 0,
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