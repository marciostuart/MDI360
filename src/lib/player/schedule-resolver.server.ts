import { and, asc, desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";
import { createDownloadUrl, isStorageConfigured } from "@/lib/storage.server";

export type PlayerItem = {
  id: string;
  kind: "image" | "video" | "web";
  url: string | null;
  durationMs: number;
  isMuted: boolean;
  name: string;
};

export type PlayerPlaylist = {
  id: string;
  name: string;
  revision: number;
  items: PlayerItem[];
} | null;

/** Minutes since midnight in the given IANA timezone, plus the weekday index. */
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

  if (!match) return null;

  const playlistRows = await db
    .select({
      id: schema.playlists.id,
      name: schema.playlists.name,
      revision: schema.playlists.revision,
    })
    .from(schema.playlists)
    .where(eq(schema.playlists.id, match.playlistId))
    .limit(1);

  const playlist = playlistRows[0];
  if (!playlist) return null;

  const itemRows = await db
    .select({
      id: schema.playlistItems.id,
      durationMs: schema.playlistItems.durationMs,
      isMuted: schema.playlistItems.isMuted,
      kind: schema.mediaAssets.kind,
      name: schema.mediaAssets.name,
      storageKey: schema.mediaAssets.storageKey,
      sourceUrl: schema.mediaAssets.sourceUrl,
      status: schema.mediaAssets.status,
    })
    .from(schema.playlistItems)
    .innerJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.playlistItems.mediaAssetId))
    .where(eq(schema.playlistItems.playlistId, playlist.id))
    .orderBy(asc(schema.playlistItems.position));

  const storageReady = isStorageConfigured();
  const items: PlayerItem[] = [];
  for (const row of itemRows) {
    if (row.status !== "ready") continue;
    let url: string | null = row.kind === "web" ? row.sourceUrl : null;
    if (row.kind !== "web" && storageReady && row.storageKey) {
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
      kind: row.kind,
      url,
      durationMs: row.durationMs,
      isMuted: row.isMuted,
      name: row.name,
    });
  }

  return { id: playlist.id, name: playlist.name, revision: playlist.revision, items };
}