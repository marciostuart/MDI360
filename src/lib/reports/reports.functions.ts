import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ReportRow = {
  id: string;
  label: string;
  plays: number;
  seconds: number;
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

/** Consulta do relatório: agrupada por TV ou por arquivo, com janela livre. */
export type ReportGroup = "device" | "media";

export type ReportQueryResult = {
  configured: boolean;
  group: ReportGroup;
  from: string;
  to: string;
  /** Total de linhas (grupos) encontradas, para a paginação. */
  totalRows: number;
  page: number;
  pageSize: number;
  totalPlays: number;
  totalSeconds: number;
  rows: ReportRow[];
};

const querySchema = z.object({
  group: z.enum(["device", "media"]).default("device"),
  from: z.string().min(1),
  to: z.string().min(1),
  page: z.number().int().default(1),
  pageSize: z.number().int().default(25),
});

/**
 * Relatório de exibição por período livre (data e hora inicial/final), agrupado
 * por TV ou por arquivo. A paginação acontece no banco: um lojista com muitas
 * telas nunca traz milhares de linhas de uma vez para a tela.
 */
export const queryPlaybackReport = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => querySchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<ReportQueryResult> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");

    const parsedFrom = new Date(data.from);
    const parsedTo = new Date(data.to);
    const validRange =
      !Number.isNaN(parsedFrom.getTime()) &&
      !Number.isNaN(parsedTo.getTime()) &&
      parsedFrom.getTime() < parsedTo.getTime();
    if (!validRange) throw new Error("Informe um período válido: a data final deve ser posterior.");

    const page = Math.max(1, data.page);
    const pageSize = Math.min(200, Math.max(5, data.pageSize));
    const base = {
      group: data.group,
      from: parsedFrom.toISOString(),
      to: parsedTo.toISOString(),
      page,
      pageSize,
    };
    if (!isDatabaseConfigured()) {
      return { configured: false, ...base, totalRows: 0, totalPlays: 0, totalSeconds: 0, rows: [] };
    }

    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq, gte, lte, sql } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    const joined = data.group === "device" ? schema.devices : schema.mediaAssets;
    const joinOn =
      data.group === "device"
        ? eq(schema.devices.id, schema.playbackEvents.deviceId)
        : eq(schema.mediaAssets.id, schema.playbackEvents.mediaAssetId);

    const scope = and(
      eq(schema.playbackEvents.organizationId, user.organizationId),
      gte(schema.playbackEvents.startedAt, parsedFrom),
      lte(schema.playbackEvents.startedAt, parsedTo),
    );

    const plays = sql<number>`count(*)::int`;
    const seconds = sql<number>`(coalesce(sum(${schema.playbackEvents.durationMs}), 0) / 1000)::int`;

    const grouped = await db
      .select({ id: joined.id, label: joined.name, plays, seconds })
      .from(schema.playbackEvents)
      .innerJoin(joined, joinOn)
      .where(scope)
      .groupBy(joined.id, joined.name)
      .orderBy(sql`count(*) desc`)
      .limit(2000);

    const totalPlays = grouped.reduce((total, row) => total + row.plays, 0);
    const totalSeconds = grouped.reduce((total, row) => total + row.seconds, 0);
    const start = (page - 1) * pageSize;

    return {
      configured: true,
      ...base,
      totalRows: grouped.length,
      totalPlays,
      totalSeconds,
      rows: grouped.slice(start, start + pageSize),
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
