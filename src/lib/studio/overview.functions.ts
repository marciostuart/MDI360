import { createServerFn } from "@tanstack/react-start";

export type StudioOverview = {
  configured: boolean;
  devices: number;
  devicesOnline: number;
  mediaReady: number;
  playlists: number;
  schedules: number;
};

/** Counters for the caller's organization only. */
export const fetchStudioOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<StudioOverview> => {
    const empty = {
      configured: false,
      devices: 0,
      devicesOnline: 0,
      mediaReady: 0,
      playlists: 0,
      schedules: 0,
    };

    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return empty;

    try {
      const { requireUser } = await import("@/lib/auth/session.server");
      const { and, eq, gt, sql } = await import("drizzle-orm");
      const user = await requireUser();
      const db = getDb();
      const orgId = user.organizationId;
      const online = new Date(Date.now() - 90_000);

      const count = sql<number>`count(*)::int`;

      const [devices, devicesOnline, mediaReady, playlists, schedules] = await Promise.all([
        db.select({ count }).from(schema.devices).where(eq(schema.devices.organizationId, orgId)),
        db
          .select({ count })
          .from(schema.devices)
          .where(
            and(eq(schema.devices.organizationId, orgId), gt(schema.devices.lastSeenAt, online)),
          ),
        db
          .select({ count })
          .from(schema.mediaAssets)
          .where(
            and(
              eq(schema.mediaAssets.organizationId, orgId),
              eq(schema.mediaAssets.status, "ready"),
            ),
          ),
        db
          .select({ count })
          .from(schema.playlists)
          .where(eq(schema.playlists.organizationId, orgId)),
        db
          .select({ count })
          .from(schema.schedules)
          .where(eq(schema.schedules.organizationId, orgId)),
      ]);

      return {
        configured: true,
        devices: Number(devices[0]?.count ?? 0),
        devicesOnline: Number(devicesOnline[0]?.count ?? 0),
        mediaReady: Number(mediaReady[0]?.count ?? 0),
        playlists: Number(playlists[0]?.count ?? 0),
        schedules: Number(schedules[0]?.count ?? 0),
      };
    } catch {
      // Schema not migrated yet, or no session: the dashboard still renders.
      return empty;
    }
  },
);