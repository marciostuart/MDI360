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

export type ReportMediaOption = {
  id: string;
  name: string;
};

export type ReportBranding = {
  organizationName: string;
  splashText: string | null;
  brandColor: string | null;
  logoDataUrl: string | null;
};

export type DailyReportRow = {
  id: string;
  label: string;
  values: Record<string, number>;
  total: number;
};

export type DailyReportResult = {
  days: string[];
  rows: DailyReportRow[];
  totalsByDay: Record<string, number>;
  totalPlays: number;
  daysWithPlayback: number;
  rowLabel: "TV" | "Arquivo";
};

const querySchema = z.object({
  group: z.enum(["device", "media"]).default("device"),
  from: z.string().min(1),
  to: z.string().min(1),
  page: z.number().int().default(1),
  pageSize: z.number().int().default(25),
  mediaAssetId: z.string().uuid().nullable().optional(),
});

/** Arquivos do próprio estabelecimento disponíveis para o filtro do relatório. */
export const listReportMediaAssets = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReportMediaOption[]> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return [];

    const { requireUser } = await import("@/lib/auth/session.server");
    const { asc, eq } = await import("drizzle-orm");
    const user = await requireUser();
    return getDb()
      .select({ id: schema.mediaAssets.id, name: schema.mediaAssets.name })
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.organizationId, user.organizationId))
      .orderBy(asc(schema.mediaAssets.name))
      .limit(2000);
  },
);

/** Identidade visual do próprio estabelecimento incorporada no PDF. */
export const getReportBranding = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReportBranding | null> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return null;

    const { requireUser } = await import("@/lib/auth/session.server");
    const { eq } = await import("drizzle-orm");
    const user = await requireUser();
    const org = (
      await getDb()
        .select({
          name: schema.organizations.name,
          splashText: schema.organizations.brandSplashText,
          brandColor: schema.organizations.brandColor,
          logoKey: schema.organizations.brandLogoKey,
        })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, user.organizationId))
        .limit(1)
    )[0];
    if (!org) return null;

    let logoDataUrl: string | null = null;
    if (org.logoKey) {
      try {
        const { getObjectBytes } = await import("@/lib/storage.server");
        const object = await getObjectBytes(org.logoKey);
        if (object && object.bytes.byteLength <= 1_500_000) {
          const mime = object.contentType?.startsWith("image/")
            ? object.contentType
            : "image/png";
          logoDataUrl = `data:${mime};base64,${Buffer.from(object.bytes).toString("base64")}`;
        }
      } catch {
        logoDataUrl = null;
      }
    }

    return {
      organizationName: org.name,
      splashText: org.splashText,
      brandColor: org.brandColor,
      logoDataUrl,
    };
  },
);

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
      data.group === "media" && data.mediaAssetId
        ? eq(schema.playbackEvents.mediaAssetId, data.mediaAssetId)
        : undefined,
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

/**
 * Matriz diária usada no PDF de até 31 dias. Quando um arquivo específico
 * é escolhido, as linhas passam a ser as TVs que o exibiram.
 */
export const queryPlaybackDailyReport = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => querySchema.pick({ group: true, from: true, to: true, mediaAssetId: true }).parse(input ?? {}))
  .handler(async ({ data }): Promise<DailyReportResult> => {
    const parsedFrom = new Date(data.from);
    const parsedTo = new Date(data.to);
    if (
      Number.isNaN(parsedFrom.getTime()) ||
      Number.isNaN(parsedTo.getTime()) ||
      parsedFrom.getTime() >= parsedTo.getTime()
    ) {
      throw new Error("Informe um período válido.");
    }

    const dayFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const daySet = new Set<string>();
    for (
      let cursor = parsedFrom.getTime();
      cursor <= parsedTo.getTime();
      cursor += 24 * 60 * 60 * 1000
    ) {
      daySet.add(dayFormatter.format(new Date(cursor)));
    }
    daySet.add(dayFormatter.format(parsedTo));
    const days = [...daySet].sort();
    if (days.length > 31) throw new Error("A matriz diária permite no máximo 31 dias.");

    const empty = (rowLabel: "TV" | "Arquivo"): DailyReportResult => ({
      days,
      rows: [],
      totalsByDay: Object.fromEntries(days.map((day) => [day, 0])),
      totalPlays: 0,
      daysWithPlayback: 0,
      rowLabel,
    });

    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    const rowLabel = data.group === "media" && !data.mediaAssetId ? "Arquivo" : "TV";
    if (!isDatabaseConfigured()) return empty(rowLabel);

    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq, gte, isNotNull, lte, sql } = await import("drizzle-orm");
    const user = await requireUser();
    const dimensionId = rowLabel === "Arquivo" ? schema.mediaAssets.id : schema.devices.id;
    const dimensionName = rowLabel === "Arquivo" ? schema.mediaAssets.name : schema.devices.name;
    const day = sql<string>`to_char(timezone(coalesce(${schema.locations.timezone}, 'America/Sao_Paulo'), ${schema.playbackEvents.startedAt}), 'YYYY-MM-DD')`;
    const plays = sql<number>`count(*)::int`;

    const grouped = await getDb()
      .select({ id: dimensionId, label: dimensionName, day, plays })
      .from(schema.playbackEvents)
      .innerJoin(schema.devices, eq(schema.devices.id, schema.playbackEvents.deviceId))
      .leftJoin(schema.locations, eq(schema.locations.id, schema.devices.locationId))
      .leftJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.playbackEvents.mediaAssetId))
      .where(
        and(
          eq(schema.playbackEvents.organizationId, user.organizationId),
          gte(schema.playbackEvents.startedAt, parsedFrom),
          lte(schema.playbackEvents.startedAt, parsedTo),
          data.group === "media" ? isNotNull(schema.playbackEvents.mediaAssetId) : undefined,
          data.group === "media" && data.mediaAssetId
            ? eq(schema.playbackEvents.mediaAssetId, data.mediaAssetId)
            : undefined,
        ),
      )
      .groupBy(dimensionId, dimensionName, day)
      .orderBy(sql`lower(${dimensionName})`, day)
      .limit(20_000);

    const totalsByDay = Object.fromEntries(days.map((value) => [value, 0]));
    const byRow = new Map<string, DailyReportRow>();
    for (const item of grouped) {
      if (!item.id || !item.label || !days.includes(item.day)) continue;
      const row = byRow.get(item.id) ?? {
        id: item.id,
        label: item.label,
        values: Object.fromEntries(days.map((value) => [value, 0])),
        total: 0,
      };
      const value = Number(item.plays);
      row.values[item.day] = value;
      row.total += value;
      totalsByDay[item.day] = (totalsByDay[item.day] ?? 0) + value;
      byRow.set(item.id, row);
    }

    const rows = [...byRow.values()];
    const totalPlays = rows.reduce((total, row) => total + row.total, 0);
    return {
      days,
      rows,
      totalsByDay,
      totalPlays,
      daysWithPlayback: days.filter((value) => (totalsByDay[value] ?? 0) > 0).length,
      rowLabel,
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
        currentPlaylistId: schema.devices.currentPlaylistId,
        currentPlaylistItemId: schema.devices.currentPlaylistItemId,
        currentMediaAssetId: schema.devices.currentMediaAssetId,
        currentPlaylistName: schema.devices.currentPlaylistName,
        currentMediaName: schema.devices.currentMediaName,
        currentMediaKind: schema.devices.currentMediaKind,
        currentPlaybackStartedAt: schema.devices.currentPlaybackStartedAt,
        currentPlaybackEndedAt: schema.devices.currentPlaybackEndedAt,
        resolvedPlaylistName: schema.playlists.name,
        resolvedMediaName: schema.mediaAssets.name,
        resolvedMediaKind: schema.mediaAssets.kind,
      })
      .from(schema.devices)
      .leftJoin(schema.playlists, eq(schema.playlists.id, schema.devices.currentPlaylistId))
      .leftJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.devices.currentMediaAssetId))
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
      const hasCurrentIdentity = Boolean(
        device.currentPlaylistId || device.currentPlaylistItemId || device.currentMediaAssetId,
      );
      // New players have a complete current snapshot. Avoid an extra query
      // per device in that case; only legacy clients need the event fallback.
      let row: {
        startedAt: Date;
        playlistName: string | null;
        mediaName: string | null;
        mediaKind: string | null;
      } | undefined;
      if (!hasCurrentIdentity && !device.currentMediaName && !device.currentPlaylistName) {
        const last = await db
          .select({
            startedAt: schema.playbackEvents.startedAt,
            playlistName: sql<string | null>`coalesce(${schema.playbackEvents.playlistName}, ${schema.playlists.name})`,
            mediaName: sql<string | null>`coalesce(${schema.playbackEvents.mediaName}, ${schema.mediaAssets.name})`,
            mediaKind: schema.mediaAssets.kind,
          })
          .from(schema.playbackEvents)
          .leftJoin(schema.playlists, eq(schema.playlists.id, schema.playbackEvents.playlistId))
          .leftJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.playbackEvents.mediaAssetId))
          .where(eq(schema.playbackEvents.deviceId, device.id))
          .orderBy(desc(schema.playbackEvents.startedAt))
          .limit(1);
        row = last[0];
      }
      const current = hasCurrentIdentity || device.currentMediaName || device.currentPlaylistName
        ? {
            playlistName: device.resolvedPlaylistName ?? device.currentPlaylistName,
            mediaName: device.resolvedMediaName ?? device.currentMediaName,
            mediaKind: device.resolvedMediaKind ?? device.currentMediaKind,
            startedAt: device.currentPlaybackStartedAt,
            endedAt: device.currentPlaybackEndedAt,
          }
        : row;
      const seen = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0;
      items.push({
        deviceId: device.id,
        deviceName: device.name,
        online: Date.now() - seen < DEVICE_ONLINE_WINDOW_MS,
        lastSeenAt: device.lastSeenAt ? new Date(device.lastSeenAt).toISOString() : null,
        playlistName: current?.playlistName ?? null,
        mediaName: current?.mediaName ?? null,
        mediaKind: current?.mediaKind ?? null,
        startedAt: current?.startedAt ? new Date(current.startedAt).toISOString() : null,
      });
    }

    return { configured: true, items };
  },
);
