import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ScheduleListItem = {
  id: string;
  deviceId: string;
  deviceName: string;
  playlistId: string;
  playlistName: string;
  weekdayMask: number;
  startMinute: number;
  endMinute: number;
  priority: number;
  isActive: boolean;
};

const baseSchema = z.object({
  deviceId: z.string().uuid(),
  playlistId: z.string().uuid(),
  weekdayMask: z.number().int().min(1).max(127),
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
  priority: z.number().int().min(0).max(100).default(0),
});

export const listSchedules = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean; items: ScheduleListItem[] }> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return { configured: false, items: [] };

    const { requireUser } = await import("@/lib/auth/session.server");
    const { asc, eq } = await import("drizzle-orm");
    const user = await requireUser();

    const rows = await getDb()
      .select({
        id: schema.schedules.id,
        deviceId: schema.schedules.deviceId,
        deviceName: schema.devices.name,
        playlistId: schema.schedules.playlistId,
        playlistName: schema.playlists.name,
        weekdayMask: schema.schedules.weekdayMask,
        startMinute: schema.schedules.startMinute,
        endMinute: schema.schedules.endMinute,
        priority: schema.schedules.priority,
        isActive: schema.schedules.isActive,
      })
      .from(schema.schedules)
      .innerJoin(schema.devices, eq(schema.devices.id, schema.schedules.deviceId))
      .innerJoin(schema.playlists, eq(schema.playlists.id, schema.schedules.playlistId))
      .where(eq(schema.schedules.organizationId, user.organizationId))
      .orderBy(asc(schema.devices.name), asc(schema.schedules.startMinute))
      .limit(500);

    return { configured: true, items: rows };
  },
);

/** Both the device and the playlist must belong to the caller's organization. */
export const createSchedule = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => baseSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.endMinute <= data.startMinute) throw new Error("O fim deve ser depois do início.");

    const { getDb, schema, isDatabaseConfigured } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) throw new Error("Banco de dados não configurado.");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    const device = await db
      .select({ id: schema.devices.id })
      .from(schema.devices)
      .where(
        and(
          eq(schema.devices.id, data.deviceId),
          eq(schema.devices.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (!device[0]) throw new Error("Tela não encontrada.");

    const playlist = await db
      .select({ id: schema.playlists.id })
      .from(schema.playlists)
      .where(
        and(
          eq(schema.playlists.id, data.playlistId),
          eq(schema.playlists.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (!playlist[0]) throw new Error("Playlist não encontrada.");

    const inserted = await db
      .insert(schema.schedules)
      .values({ ...data, organizationId: user.organizationId })
      .returning({ id: schema.schedules.id });

    const { notifyOrganization } = await import("@/lib/player/realtime.server");
    notifyOrganization(user.organizationId);

    return { id: inserted[0]!.id };
  });

export const toggleSchedule = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ scheduleId: z.string().uuid(), isActive: z.boolean() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();

    await getDb()
      .update(schema.schedules)
      .set({ isActive: data.isActive })
      .where(
        and(
          eq(schema.schedules.id, data.scheduleId),
          eq(schema.schedules.organizationId, user.organizationId),
        ),
      );

    const { notifyOrganization } = await import("@/lib/player/realtime.server");
    notifyOrganization(user.organizationId);

    return { ok: true };
  });

export const deleteSchedule = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ scheduleId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();

    await getDb()
      .delete(schema.schedules)
      .where(
        and(
          eq(schema.schedules.id, data.scheduleId),
          eq(schema.schedules.organizationId, user.organizationId),
        ),
      );

    return { ok: true };
  });