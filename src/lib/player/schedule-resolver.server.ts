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
import {
  WIDGET_TYPES,
  getWidgetDefinition,
  widgetConfigSchema,
  type WidgetConfig,
} from "@/lib/widgets/catalog";
import { isPlatformWidgetType } from "@/lib/widgets/platform-widgets";
import {
  mergePlatformWidgetConfig,
  platformWidgetDuration,
  readPlatformWidgetSettings,
  type PlatformWidgetSettings,
} from "@/lib/widgets/platform-widgets.server";
import { hydrateWidgetImageUrls } from "@/lib/widgets/background-storage.server";
import type { PlayerItem, PlayerPlaylist } from "@/lib/player/contracts";
export type { PlayerItem, PlayerPlaylist } from "@/lib/player/contracts";

export type PlayerPlaybackPlan = {
  preparationPending: boolean;
  playlist: PlayerPlaylist;
  fallbackPlaylist: PlayerPlaylist;
  /** Rule authorized by the latest server sync. The client may only keep this
   * scheduled playlist offline while the same rule still matches locally. */
  activeScheduleRule: ScheduleRule | null;
  preloadItems: PlayerItem[];
  timezone: string;
  serverTime: string;
};

/**
 * Stable fingerprint of everything a terminal needs to keep cached and play.
 *
 * The in-process realtime bus is only an acceleration layer: in a Swarm
 * deployment, a Studio request and a TV long-poll can land on different
 * replicas. This database-resolved signature is therefore the safe fallback.
 */
export function playbackPlanRevision(plan: PlayerPlaybackPlan): string {
  const playlist = (value: PlayerPlaylist) =>
    value
      ? [
          value.id,
          value.revision,
          value.items.map((item) => [
            item.id,
            item.mediaAssetId,
            item.kind,
            item.cacheKey ?? item.url,
            item.durationMs,
            item.isMuted,
            item.widgetType,
            item.widgetConfig,
            item.airStartAt,
            item.airEndAt,
            item.scheduleConstraints,
          ]),
        ]
      : null;

  return JSON.stringify({
    playlist: playlist(plan.playlist),
    fallback: playlist(plan.fallbackPlaylist),
    activeRule: plan.activeScheduleRule,
    preload: plan.preloadItems.map((item) => [
      item.id,
      item.mediaAssetId,
      item.kind,
      item.cacheKey ?? item.url,
      item.durationMs,
      item.widgetType,
      item.widgetConfig,
      item.airStartAt,
      item.airEndAt,
      item.scheduleConstraints,
    ]),
  });
}

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
  platformWidgets: PlatformWidgetSettings,
  prefix = "",
  constraints: ScheduleRule[][] = [],
): Promise<{ items: PlayerItem[]; finger: string[]; pending: boolean }> {
  if (path.has(playlistId) || path.size >= 8) return { items: [], finger: [`cycle:${playlistId}`], pending: false };
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
      byteSize: schema.mediaAssets.byteSize,
      checksum: schema.mediaAssets.checksum,
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
  let pending = false;
  for (const row of rows) {
    if (row.nestedPlaylistId) {
      const rules = row.scheduleRules as ScheduleRule[];
      if (!anyScheduleRuleMatches(rules, now, timezone)) continue;
      const nested = await resolveItems(
        row.nestedPlaylistId,
        timezone,
        now,
        nextPath,
        platformWidgets,
        `${prefix}${row.id}:`,
        rules?.length ? [...constraints, rules] : constraints,
      );
      items.push(...nested.items);
      pending ||= nested.pending;
      finger.push(
        `${row.id}:nested:${row.nestedPlaylistId}:${row.nestedRevision ?? 0}`,
        ...nested.finger,
      );
      continue;
    }
    if (row.airStartAt && row.airStartAt > now) continue;
    if (row.airEndAt && row.airEndAt <= now) continue;
    // Uploading also covers the server's normalization step until ready.
    if (row.mediaAssetId && row.status === "uploading") pending = true;
    if (!row.mediaAssetId || !row.kind || !row.name || row.status !== "ready") continue;
    if (isPlatformWidgetType(row.widgetType) && !platformWidgets[row.widgetType].active) continue;
    if (row.kind === "widget") {
      const storedConfig = (row.widgetConfig as WidgetConfig | null) ?? null;
      const rawWidgetConfig = isPlatformWidgetType(row.widgetType)
        ? mergePlatformWidgetConfig(row.widgetType, platformWidgets[row.widgetType], storedConfig)
        : storedConfig;
      // Older widget rows can have a missing or partially invalid JSON config
      // after relinking. Never send a widget with a null config: the browser
      // would fall through to the empty image branch and remain black.
      const fallbackConfig = WIDGET_TYPES.includes(row.widgetType as (typeof WIDGET_TYPES)[number])
        ? getWidgetDefinition(row.widgetType as (typeof WIDGET_TYPES)[number]).defaultConfig
        : null;
      const parsedWidgetConfig = widgetConfigSchema.safeParse(rawWidgetConfig ?? fallbackConfig);
      const widgetConfig = parsedWidgetConfig.success
        ? await hydrateWidgetImageUrls(parsedWidgetConfig.data)
        : null;
      items.push({
        id: `${prefix}${row.id}`,
        mediaAssetId: row.mediaAssetId,
        kind: "widget",
        url: null,
        durationMs: widgetConfig
          ? (platformWidgetDuration(widgetConfig) ?? row.durationMs)
          : row.durationMs,
        isMuted: row.isMuted,
        name: row.name,
        widgetType: row.widgetType,
        widgetConfig,
        airStartAt: row.airStartAt?.toISOString() ?? null,
        airEndAt: row.airEndAt?.toISOString() ?? null,
        scheduleConstraints: constraints,
      });
      finger.push(`${row.id}:${JSON.stringify(widgetConfig)}`);
      continue;
    }
    const external = row.kind === "web" || row.kind === "stream";
    let url: string | null = external ? row.sourceUrl : null;
    if (!external && isStorageConfigured() && row.storageKey) {
      try {
        url = await createDownloadUrl(row.storageKey, 6 * 3600);
      } catch {
        pending = true;
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
      cacheKey: `${row.mediaAssetId}:${row.storageKey ?? row.sourceUrl ?? ""}:${row.checksum ?? row.byteSize ?? ""}`,
      byteSize: row.byteSize,
      airStartAt: row.airStartAt?.toISOString() ?? null,
      airEndAt: row.airEndAt?.toISOString() ?? null,
      scheduleConstraints: constraints,
    });
    finger.push(`${row.id}:${row.storageKey ?? row.sourceUrl ?? ""}`);
  }
  return { items, finger, pending };
}

/** Selects the most specific active schedule; an empty result falls back to the default playlist. */
export async function resolvePlaybackPlanForDevice(
  deviceId: string,
  timezone = "America/Sao_Paulo",
): Promise<PlayerPlaybackPlan> {
  const db = getDb();
  const now = new Date();
  const platformWidgets = await readPlatformWidgetSettings();
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
  const preparationByPlaylist = new Map<string, boolean>();
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
    const resolved = await resolveItems(playlist.id, timezone, now, new Set(), platformWidgets);
    preparationByPlaylist.set(playlistId, resolved.pending);
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
      preparationPending: Boolean(preparationByPlaylist.get(match.playlistId) || (device[0]?.defaultPlaylistId && preparationByPlaylist.get(device[0].defaultPlaylistId))),
      fallbackPlaylist,
      activeScheduleRule: match.rule,
      preloadItems,
      timezone,
      serverTime: now.toISOString(),
    };
  }
  return {
    playlist: fallbackPlaylist,
    preparationPending: Boolean((device[0]?.defaultPlaylistId && preparationByPlaylist.get(device[0].defaultPlaylistId)) || matches.some((candidate) => preparationByPlaylist.get(candidate.playlistId))),
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
