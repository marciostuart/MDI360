import { and, asc, desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";
import {
  anyScheduleRuleMatches,
  legacyScheduleRule,
  matchesScheduleRule,
  scheduleSpecificity,
  type ScheduleRule,
} from "@/lib/schedules/rules";
import { createDownloadUrl, isStorageConfigured } from "@/lib/storage.server";
import type { WidgetConfig } from "@/lib/widgets/catalog";
import { isPlatformWidgetType } from "@/lib/widgets/platform-widgets";
import { readPlatformWidgetSettings } from "@/lib/widgets/platform-widgets.server";

export type PlayerItem = {
  id: string;
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

export type PlayerPlaybackPlan = {
  playlist: PlayerPlaylist;
  fallbackPlaylist: PlayerPlaylist;
  /** Rule authorized by the latest server sync. The client may only keep this
   * scheduled playlist offline while the same rule still matches locally. */
  activeScheduleRule: ScheduleRule | null;
  preloadItems: PlayerItem[];
  timezone: string;
  serverTime: string;
};

function fingerprint(values: string[]) {
  let hash = 0;
  for (const value of values)
    for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) % 100003;
  return hash % 997;
}

async function resolveItems(
  playlistId: string,
  timezone: string,
  now: Date,
  path: Set<string>,
  activePlatformWidgets: Set<string>,
  prefix = "",
): Promise<{ items: PlayerItem[]; finger: string[] }> {
  if (path.has(playlistId) || path.size >= 8) return { items: [], finger: [`cycle:${playlistId}`] };
  const nextPath = new Set(path).add(playlistId);
  const rows = await getDb()
    .select({
      id: schema.playlistItems.id,
      mediaAssetId: schema.playlistItems.mediaAssetId,
      nestedPlaylistId: schema.playlistItems.nestedPlaylistId,
      scheduleRules: schema.playlistItems.scheduleRules,
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
      nestedRevision: schema.playlists.revision,
    })
    .from(schema.playlistItems)
    .leftJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.playlistItems.mediaAssetId))
    .leftJoin(schema.playlists, eq(schema.playlists.id, schema.playlistItems.nestedPlaylistId))
    .where(eq(schema.playlistItems.playlistId, playlistId))
    .orderBy(asc(schema.playlistItems.position));

  const items: PlayerItem[] = [];
  const finger: string[] = [];
  for (const row of rows) {
    if (row.nestedPlaylistId) {
      const rules = row.scheduleRules as ScheduleRule[];
      if (!anyScheduleRuleMatches(rules, now, timezone)) continue;
      const nested = await resolveItems(
        row.nestedPlaylistId,
        timezone,
        now,
        nextPath,
        activePlatformWidgets,
        `${prefix}${row.id}:`,
      );
      items.push(...nested.items);
      finger.push(
        `${row.id}:nested:${row.nestedPlaylistId}:${row.nestedRevision ?? 0}`,
        ...nested.finger,
      );
      continue;
    }
    if (!row.mediaAssetId || !row.kind || !row.name || row.status !== "ready") continue;
    if (isPlatformWidgetType(row.widgetType) && !activePlatformWidgets.has(row.widgetType))
      continue;
    if (row.airStartAt && row.airStartAt > now) continue;
    if (row.airEndAt && row.airEndAt < now) continue;
    if (row.kind === "widget") {
      items.push({
        id: `${prefix}${row.id}`,
        mediaAssetId: row.mediaAssetId,
        kind: "widget",
        url: null,
        durationMs: row.durationMs,
        isMuted: row.isMuted,
        name: row.name,
        widgetType: row.widgetType,
        widgetConfig: (row.widgetConfig as WidgetConfig | null) ?? null,
      });
      finger.push(`${row.id}:${JSON.stringify(row.widgetConfig ?? null)}`);
      continue;
    }
    const external = row.kind === "web" || row.kind === "stream";
    let url: string | null = external ? row.sourceUrl : null;
    if (!external && isStorageConfigured() && row.storageKey) {
      try {
        url = await createDownloadUrl(row.storageKey, 6 * 3600);
      } catch {
        url = null;
      }
    }
    if (!url) continue;
    items.push({
      id: `${prefix}${row.id}`,
      mediaAssetId: row.mediaAssetId,
      kind: row.kind,
      url,
      durationMs: row.durationMs,
      isMuted: row.isMuted,
      name: row.name,
      widgetType: null,
      widgetConfig: null,
    });
    finger.push(`${row.id}:${row.storageKey ?? row.sourceUrl ?? ""}`);
  }
  return { items, finger };
}

/** Selects the most specific active schedule; an empty result falls back to the default playlist. */
export async function resolvePlaybackPlanForDevice(
  deviceId: string,
  timezone = "America/Sao_Paulo",
): Promise<PlayerPlaybackPlan> {
  const db = getDb();
  const now = new Date();
  const platformWidgets = await readPlatformWidgetSettings();
  const activePlatformWidgets = new Set(
    Object.entries(platformWidgets).flatMap(([type, entry]) => (entry.active ? [type] : [])),
  );
  const candidates = await db
    .select({
      playlistId: schema.schedules.playlistId,
      weekdayMask: schema.schedules.weekdayMask,
      startMinute: schema.schedules.startMinute,
      endMinute: schema.schedules.endMinute,
      validFrom: schema.schedules.validFrom,
      validUntil: schema.schedules.validUntil,
      ruleType: schema.schedules.ruleType,
      ruleConfig: schema.schedules.ruleConfig,
      createdAt: schema.schedules.createdAt,
    })
    .from(schema.schedules)
    .where(and(eq(schema.schedules.deviceId, deviceId), eq(schema.schedules.isActive, true)))
    .orderBy(desc(schema.schedules.createdAt));

  const matches = candidates
    .map((row) => ({ ...row, rule: legacyScheduleRule(row) }))
    .filter((row) => matchesScheduleRule(row.rule, now, timezone))
    .sort(
      (a, b) =>
        scheduleSpecificity(b.rule.type) - scheduleSpecificity(a.rule.type) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );

  const device = await db
    .select({ defaultPlaylistId: schema.devices.defaultPlaylistId })
    .from(schema.devices)
    .where(eq(schema.devices.id, deviceId))
    .limit(1);
  const loadPlaylist = async (playlistId: string | null | undefined): Promise<PlayerPlaylist> => {
    if (!playlistId) return null;
    const playlist = (
      await db
        .select({
          id: schema.playlists.id,
          name: schema.playlists.name,
          revision: schema.playlists.revision,
        })
        .from(schema.playlists)
        .where(eq(schema.playlists.id, playlistId))
        .limit(1)
    )[0];
    if (!playlist) return null;
    const resolved = await resolveItems(
      playlist.id,
      timezone,
      now,
      new Set(),
      activePlatformWidgets,
    );
    if (!resolved.items.length) return null;
    return {
      id: playlist.id,
      name: playlist.name,
      revision: playlist.revision * 1000 + fingerprint(resolved.finger),
      items: resolved.items,
    };
  };

  const fallbackPlaylist = await loadPlaylist(device[0]?.defaultPlaylistId);
  const preloadPlaylists = await Promise.all(
    [...new Set(candidates.map((candidate) => candidate.playlistId))].map(loadPlaylist),
  );
  const preloadItems = [
    ...(fallbackPlaylist?.items ?? []),
    ...preloadPlaylists.flatMap((playlist) => playlist?.items ?? []),
  ].filter(
    (item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index,
  );
  for (const match of matches) {
    const playlist = await loadPlaylist(match.playlistId);
    if (!playlist) continue;
    return {
      playlist,
      fallbackPlaylist,
      activeScheduleRule: match.rule,
      preloadItems,
      timezone,
      serverTime: now.toISOString(),
    };
  }
  return {
    playlist: fallbackPlaylist,
    fallbackPlaylist,
    activeScheduleRule: null,
    preloadItems,
    timezone,
    serverTime: now.toISOString(),
  };
}

/** Compatibility helper for callers that only need the server-selected playlist. */
export async function resolvePlaylistForDevice(
  deviceId: string,
  timezone = "America/Sao_Paulo",
): Promise<PlayerPlaylist> {
  return (await resolvePlaybackPlanForDevice(deviceId, timezone)).playlist;
}
