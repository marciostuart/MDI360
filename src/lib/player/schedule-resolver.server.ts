import { and, asc, desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";
import { createDownloadUrl, isStorageConfigured } from "@/lib/storage.server";
import type { WidgetConfig } from "@/lib/widgets/catalog";

export type PlayerItem = {
  id: string;
  /** Media library asset behind this item; used by the playback reports. */
  mediaAssetId: string | null;
  kind: "image" | "video" | "web" | "widget" | "stream";
  url: string | null;
  durationMs: number;
  isMuted: boolean;
  name: string;
  widgetType: string | null;
  widgetConfig: WidgetConfig | null;
};

export type PlayerPlaylist = {
  id: string;
  name: string;
  revision: number;
  items: PlayerItem[];
} | null;

/** Minutes since midnight in the given IANA timezone, plus the weekday index. */
/**
 * Small stable fingerprint of the ids currently allowed on air. Mixed into the
 * playlist revision so a screen reloads the moment a file's airing window opens
 * or closes, even though the playlist itself never changed.
 */
function fingerprint(ids: string[]) {
  let hash = 0;
  for (const id of ids) {
    for (let i = 0; i < id.length; i += 1) {
      hash = (hash * 31 + id.charCodeAt(i)) % 100003;
    }
  }
  return hash % 997;
}

function localNow(timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekday = Math.max(0, weekdays.indexOf(get("weekday")));
  const minute = Number(get("hour")) * 60 + Number(get("minute"));
  return { weekday, minute };
}

/**
 * Picks the playlist a device should be showing right now: the highest priority
 * active schedule whose weekday/time window matches, otherwise the only playlist
 * scheduled for the device, otherwise nothing.
 */
export async function resolvePlaylistForDevice(
  deviceId: string,
  timezone = "America/Sao_Paulo",
): Promise<PlayerPlaylist> {
  const db = getDb();
  const { weekday, minute } = localNow(timezone);

  const candidates = await db
    .select({
      playlistId: schema.schedules.playlistId,
      weekdayMask: schema.schedules.weekdayMask,
      startMinute: schema.schedules.startMinute,
      endMinute: schema.schedules.endMinute,
      priority: schema.schedules.priority,
      validFrom: schema.schedules.validFrom,
      validUntil: schema.schedules.validUntil,
    })
    .from(schema.schedules)
    .where(and(eq(schema.schedules.deviceId, deviceId), eq(schema.schedules.isActive, true)))
    .orderBy(desc(schema.schedules.priority));

  const now = new Date();
  const match = candidates.find((row) => {
    if (row.validFrom && row.validFrom > now) return false;
    if (row.validUntil && row.validUntil < now) return false;
    if (((row.weekdayMask >> weekday) & 1) !== 1) return false;
    return minute >= row.startMinute && minute < row.endMinute;
  });

  // No schedule matches right now: fall back to the screen's default playlist.
  let playlistId = match?.playlistId ?? null;
  if (!playlistId) {
    const deviceRows = await db
      .select({ defaultPlaylistId: schema.devices.defaultPlaylistId })
      .from(schema.devices)
      .where(eq(schema.devices.id, deviceId))
      .limit(1);
    playlistId = deviceRows[0]?.defaultPlaylistId ?? null;
  }
  if (!playlistId) return null;

  const playlistRows = await db
    .select({
      id: schema.playlists.id,
      name: schema.playlists.name,
      revision: schema.playlists.revision,
    })
    .from(schema.playlists)
    .where(eq(schema.playlists.id, playlistId))
    .limit(1);

  const playlist = playlistRows[0];
  if (!playlist) return null;

  const itemRows = await db
    .select({
      id: schema.playlistItems.id,
      mediaAssetId: schema.playlistItems.mediaAssetId,
      durationMs: schema.playlistItems.durationMs,
      isMuted: schema.playlistItems.isMuted,
      kind: schema.mediaAssets.kind,
      name: schema.mediaAssets.name,
      storageKey: schema.mediaAssets.storageKey,
      sourceUrl: schema.mediaAssets.sourceUrl,
      status: schema.mediaAssets.status,
      widgetType: schema.mediaAssets.widgetType,
      widgetConfig: schema.mediaAssets.widgetConfig,
      airStartAt: schema.mediaAssets.airStartAt,
      airEndAt: schema.mediaAssets.airEndAt,
    })
    .from(schema.playlistItems)
    .innerJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.playlistItems.mediaAssetId))
    .where(eq(schema.playlistItems.playlistId, playlist.id))
    .orderBy(asc(schema.playlistItems.position));

  const storageReady = isStorageConfigured();
  const items: PlayerItem[] = [];
  /**
   * Item id + underlying object key. Mixed into the revision so a screen also
   * re-syncs when a file is *replaced* in place (same playlist, new content).
   */
  const fingerSource: string[] = [];
  for (const row of itemRows) {
    if (row.status !== "ready") continue;
    // Per-file airing window (flash offers): outside it the file never plays,
    // no matter which playlist it belongs to.
    if (row.airStartAt && row.airStartAt > now) continue;
    if (row.airEndAt && row.airEndAt < now) continue;
    // Widgets render locally on the TV from open data; they carry no file URL.
    if (row.kind === "widget") {
      items.push({
        id: row.id,
        mediaAssetId: row.mediaAssetId,
        kind: "widget",
        url: null,
        durationMs: row.durationMs,
        isMuted: row.isMuted,
        name: row.name,
        widgetType: row.widgetType,
        widgetConfig: (row.widgetConfig as WidgetConfig | null) ?? null,
      });
      fingerSource.push(`${row.id}:${JSON.stringify(row.widgetConfig ?? null)}`);
      continue;
    }
    // `web` e `stream` são endereços externos: a TV abre na hora, sem download.
    const isExternal = row.kind === "web" || row.kind === "stream";
    let url: string | null = isExternal ? row.sourceUrl : null;
    if (!isExternal && storageReady && row.storageKey) {
      try {
        // 6h beats the 5min sync loop by a wide margin, so playback never stalls.
        url = await createDownloadUrl(row.storageKey, 6 * 3600);
      } catch {
        url = null;
      }
    }
    if (!url) continue;
    items.push({
      id: row.id,
      mediaAssetId: row.mediaAssetId,
      kind: row.kind,
      url,
      durationMs: row.durationMs,
      isMuted: row.isMuted,
      name: row.name,
      widgetType: null,
      widgetConfig: null,
    });
    fingerSource.push(`${row.id}:${row.storageKey ?? row.sourceUrl ?? ""}`);
  }

  return {
    id: playlist.id,
    name: playlist.name,
    revision: playlist.revision * 1000 + fingerprint(fingerSource),
    items,
  };
}