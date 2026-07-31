import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ReportRow = {
  id: string;
  label: string;
  plays: number;
  seconds: number;
};

export type PlaybackReport = {
  configured: boolean;
  from: string;
  totalPlays: number;
  totalSeconds: number;
  byDevice: ReportRow[];
  byPlaylist: ReportRow[];
  byMedia: ReportRow[];
};

export type NowPlayingRow = {
  deviceId: string;
  deviceName: string;
  online: boolean;
  lastSeenAt: string | null;
  playlistName: string | null;
  mediaName: string | null;
  mediaKind: string | null;
  startedAt: string | null;
};

const rangeSchema = z.object({ days: z.number().int().min(1).max(90).default(7) });

/** Playback totals of the caller's organization, grouped three ways. */
export const getPlaybackReport = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => rangeSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<PlaybackReport> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    const from = new Date(Date.now() - data.days * 24 * 3600 * 1000);
    const empty = {
      from: from.toISOString(),
      totalPlays: 0,
      totalSeconds: 0,
      byDevice: [],
      byPlaylist: [],
      byMedia: [],
    };
    if (!isDatabaseConfigured()) return { configured: false, ...empty };

    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq, gte, sql } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    const scope = and(
      eq(schema.playbackEvents.organizationId, user.organizationId),
      gte(schema.playbackEvents.startedAt, from),
    );
    const plays = sql<number>`count(*)::int`;
    const seconds = sql<number>`(coalesce(sum(${schema.playbackEvents.durationMs}), 0) / 1000)::int`;

    const [deviceRows, playlistRows, mediaRows] = await Promise.all([
      db
        .select({ id: schema.devices.id, label: schema.devices.name, plays, seconds })
        .from(schema.playbackEvents)
        .innerJoin(schema.devices, eq(schema.devices.id, schema.playbackEvents.deviceId))
        .where(scope)
        .groupBy(schema.devices.id, schema.devices.name)
        .orderBy(sql`count(*) desc`)
        .limit(100),
      db
        .select({ id: schema.playlists.id, label: schema.playlists.name, plays, seconds })
        .from(schema.playbackEvents)
        .innerJoin(schema.playlists, eq(schema.playlists.id, schema.playbackEvents.playlistId))
        .where(scope)
        .groupBy(schema.playlists.id, schema.playlists.name)
        .orderBy(sql`count(*) desc`)
        .limit(100),
      db
        .select({ id: schema.mediaAssets.id, label: schema.mediaAssets.name, plays, seconds })
        .from(schema.playbackEvents)
        .innerJoin(
          schema.mediaAssets,
          eq(schema.mediaAssets.id, schema.playbackEvents.mediaAssetId),
        )
        .where(scope)
        .groupBy(schema.mediaAssets.id, schema.mediaAssets.name)
        .orderBy(sql`count(*) desc`)
        .limit(200),
    ]);

    return {
      configured: true,
      from: from.toISOString(),
      totalPlays: deviceRows.reduce((total, row) => total + row.plays, 0),
      totalSeconds: deviceRows.reduce((total, row) => total + row.seconds, 0),
      byDevice: deviceRows,
      byPlaylist: playlistRows,
      byMedia: mediaRows,
    };
  });

/** What each linked screen of the organization is showing right now. */
export const getNowPlaying = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean; items: NowPlayingRow[] }> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return { configured: false, items: [] };

    const { requireUser } = await import("@/lib/auth/session.server");
    const { DEVICE_ONLINE_WINDOW_MS } = await import("@/lib/devices/devices.functions");
    const { and, eq, desc, sql } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    const devices = await db
      .select({
        id: schema.devices.id,
        name: schema.devices.name,
        lastSeenAt: schema.devices.lastSeenAt,
      })
      .from(schema.devices)
      .where(
        and(
          eq(schema.devices.organizationId, user.organizationId),
          eq(schema.devices.status, "active"),
        ),
      )
      .orderBy(sql`lower(${schema.devices.name})`)
      .limit(200);

    const items: NowPlayingRow[] = [];
    for (const device of devices) {
      const last = await db
        .select({
          startedAt: schema.playbackEvents.startedAt,
          playlistName: schema.playlists.name,
          mediaName: schema.mediaAssets.name,
          mediaKind: schema.mediaAssets.kind,
        })
        .from(schema.playbackEvents)
        .leftJoin(schema.playlists, eq(schema.playlists.id, schema.playbackEvents.playlistId))
        .leftJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.playbackEvents.mediaAssetId))
        .where(eq(schema.playbackEvents.deviceId, device.id))
        .orderBy(desc(schema.playbackEvents.startedAt))
        .limit(1);

      const row = last[0];
      const seen = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0;
      items.push({
        deviceId: device.id,
        deviceName: device.name,
        online: Date.now() - seen < DEVICE_ONLINE_WINDOW_MS,
        lastSeenAt: device.lastSeenAt ? new Date(device.lastSeenAt).toISOString() : null,
        playlistName: row?.playlistName ?? null,
        mediaName: row?.mediaName ?? null,
        mediaKind: row?.mediaKind ?? null,
        startedAt: row?.startedAt ? new Date(row.startedAt).toISOString() : null,
      });
    }

    return { configured: true, items };
  },
);
