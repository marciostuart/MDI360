import type { WidgetConfig } from "@/lib/widgets/catalog";

export type PlayerState =
  | "UNLINKED"
  | "SYNCING"
  | "DOWNLOADING"
  | "READY"
  | "PLAYING"
  | "WAITING_FOR_UPDATE"
  | "OFFLINE_PLAYING";

export type PlayerItem = {
  id: string;
  /** Stable playlist row identity; unlike `id`, it is never prefixed for nested lists. */
  playlistItemId: string;
  mediaAssetId: string | null;
  kind: "image" | "video" | "web" | "widget" | "stream";
  url: string | null;
  durationMs: number;
  isMuted: boolean;
  name: string;
  widgetType: string | null;
  widgetConfig: WidgetConfig | null;
  cacheKey?: string;
  byteSize?: number | null;
  airStartAt?: string | null;
  airEndAt?: string | null;
  scheduleConstraints?: unknown;
};

export type PlayerPlaylist = {
  id: string;
  name: string;
  revision: number;
  items: PlayerItem[];
} | null;

export type ManifestRevision = {
  revision: number;
  contentRevision: string;
  etag: string;
};

export type MediaInventoryEntry = {
  mediaAssetId: string;
  cacheKey: string;
  kind: "image" | "video";
  byteSize: number | null;
  status: "missing" | "downloading" | "ready" | "failed";
};

export type DownloadStatus = {
  cacheKey: string;
  status: MediaInventoryEntry["status"];
  bytesDownloaded?: number;
  totalBytes?: number | null;
  error?: string;
};

export type PlaybackEvent = {
  eventId: string;
  deviceId?: string;
  playlistId: string | null;
  playlistItemId: string | null;
  playlistRevision?: number;
  mediaAssetId: string | null;
  durationMs: number;
  startedAt: string;
  endedAt?: string;
  completed?: boolean;
};

export type PlaybackOutbox = {
  version: 1;
  events: PlaybackEvent[];
};

export type DeviceInvalidation = {
  deviceId: string;
  revision: number;
  reason: "playlist" | "schedule" | "device" | "branding" | "cache" | "unlink" | "unknown";
};

export type WidgetLifecycleEvent = {
  widgetId: string;
  state: "loading" | "ready" | "displaying" | "ending" | "disposed";
  at: string;
};

export type PlayerManifest = ManifestRevision & {
  device: {
    id: string;
    name: string;
    transitionEffect: "none" | "fade";
    audioEnabled?: boolean;
    enabledModes?: string[];
    screenWidth?: number | null;
    screenHeight?: number | null;
  };
  playlist: PlayerPlaylist;
  mediaInventory: MediaInventoryEntry[];
  preparationPending: boolean;
};
