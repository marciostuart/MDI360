import { relations, sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const appRoleEnum = pgEnum("app_role", ["owner", "admin", "operator"]);
export const mediaKindEnum = pgEnum("media_kind", ["image", "video", "web", "widget"]);
export const mediaStatusEnum = pgEnum("media_status", ["uploading", "ready", "failed"]);
export const deviceStatusEnum = pgEnum("device_status", ["pending", "active", "blocked"]);
export const commandKindEnum = pgEnum("command_kind", [
  "reload",
  "restart",
  "screenshot",
  "sync_playlist",
  "update_app",
]);
export const commandStatusEnum = pgEnum("command_status", [
  "queued",
  "delivered",
  "done",
  "failed",
]);

/* ------------------------------------------------------------------ */
/* Tenancy + identity                                                  */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Commercial plans (platform level)                                   */
/* ------------------------------------------------------------------ */

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** Maximum number of linked screens allowed on this plan. */
  maxDevices: integer("max_devices").notNull().default(5),
  /** Storage quota in megabytes. */
  maxStorageMb: integer("max_storage_mb").notNull().default(1024),
  priceCents: integer("price_cents").notNull().default(0),
  /** Whether the queue (senhas) add-on is included in this plan. */
  queueEnabled: boolean("queue_enabled").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Hourly server traffic buckets, used by the platform load dashboard. */
export const trafficHourly = pgTable("traffic_hourly", {
  bucket: timestamp("bucket", { withTimezone: true }).primaryKey(),
  requests: integer("requests").notNull().default(0),
  bytesIn: bigint("bytes_in", { mode: "number" }).notNull().default(0),
  bytesOut: bigint("bytes_out", { mode: "number" }).notNull().default(0),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** Whitelabel: storage key of the logo shown on the TV splash. */
  brandLogoKey: text("brand_logo_key"),
  /** Whitelabel: text shown under the logo while the app boots. */
  brandSplashText: text("brand_splash_text"),
  /** Whitelabel: accent colour (hex) used on the splash/activation screen. */
  brandColor: text("brand_color"),
  /** Commercial plan, subscription state and per-account limit overrides. */
  planId: uuid("plan_id"),
  subscriptionStatus: text("subscription_status").notNull().default("trial"),
  subscriptionExpiresAt: timestamp("subscription_expires_at", { withTimezone: true }),
  deviceLimitOverride: integer("device_limit_override"),
  storageLimitMbOverride: integer("storage_limit_mb_override"),
  /** Per-account override for the queue add-on (null = follow the plan). */
  queueEnabledOverride: boolean("queue_enabled_override"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

/**
 * Roles live in their own table, never on the user row. Prevents a compromised
 * profile update from escalating privileges.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: appRoleEnum("role").notNull(),
  },
  (t) => [uniqueIndex("user_roles_user_role_unique").on(t.userId, t.role)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Locations + devices (the TVs)                                        */
/* ------------------------------------------------------------------ */

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("locations_org_idx").on(t.organizationId)],
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Null while the TV has announced itself but no customer has linked it yet.
     * The row still reserves the activation code so no two TVs collide.
     */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    name: text("name").notNull().default("Tela aguardando vínculo"),
    /**
     * Playlist this screen plays whenever no schedule matches the current time.
     * Lets a customer put content on a TV without touching the Agenda.
     */
    defaultPlaylistId: uuid("default_playlist_id"),
    status: deviceStatusEnum("status").notNull().default("pending"),
    /** Activation code shown on the TV. Stays reserved while the row exists. */
    pairingCode: text("pairing_code"),
    pairingExpiresAt: timestamp("pairing_expires_at", { withTimezone: true }),
    /** Hash of the long-lived device token. Raw token never stored. */
    tokenHash: text("token_hash"),
    orientation: smallint("orientation").notNull().default(0),
    /**
     * Global audio switch for this screen. When false the TV plays every video
     * silently, even if the playlist item asks for sound.
     */
    audioEnabled: boolean("audio_enabled").notNull().default(true),
    /**
     * Transition played between playlist items on this screen.
     * "none" = corte seco (default), "fade" = crossfade suave.
     */
    transitionEffect: text("transition_effect").notNull().default("none"),
    /** Screen shape this TV/totem uses; drives which media fits it. */
    canvasPreset: text("canvas_preset").notNull().default("landscape-fhd"),
    appVersion: text("app_version"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    lastScreenshotKey: text("last_screenshot_key"),
    lastScreenshotAt: timestamp("last_screenshot_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("devices_org_idx").on(t.organizationId),
    uniqueIndex("devices_pairing_code_unique").on(t.pairingCode),
  ],
);

/* ------------------------------------------------------------------ */
/* Media + playlists                                                    */
/* ------------------------------------------------------------------ */

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: mediaKindEnum("kind").notNull(),
    status: mediaStatusEnum("status").notNull().default("uploading"),
    /** Canvas preset the file was normalized for (see src/lib/media/presets.ts). */
    canvasPreset: text("canvas_preset").notNull().default("landscape-fhd"),
    /** Size of the file the user picked, before optimization. */
    originalByteSize: integer("original_byte_size"),
    /** Object key inside the MinIO bucket. Empty for `web` assets. */
    storageKey: text("storage_key"),
    /** External URL for `web` assets. */
    sourceUrl: text("source_url"),
    /** Information widget type (clock/weather/currency/news) for `widget` assets. */
    widgetType: text("widget_type"),
    /** Widget settings (city, feed, currency pairs...). Validated before saving. */
    widgetConfig: jsonb("widget_config"),
    /** Free-form labels used to filter the library ("promoções", "loja 2"...). */
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    mimeType: text("mime_type"),
    byteSize: integer("byte_size"),
    durationMs: integer("duration_ms"),
    width: integer("width"),
    height: integer("height"),
    checksum: text("checksum"),
    /**
     * Optional airing window for this file. When set, the file only plays
     * between these two instants — no matter in how many playlists it sits.
     * Used for flash offers ("31/07 das 12h às 14h").
     */
    airStartAt: timestamp("air_start_at", { withTimezone: true }),
    airEndAt: timestamp("air_end_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("media_assets_org_idx").on(t.organizationId)],
);

export const playlists = pgTable(
  "playlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Bumped on every change so players know to re-sync. */
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("playlists_org_idx").on(t.organizationId)],
);

export const playlistItems = pgTable(
  "playlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    durationMs: integer("duration_ms").notNull().default(10000),
    isMuted: boolean("is_muted").notNull().default(true),
  },
  (t) => [index("playlist_items_playlist_idx").on(t.playlistId, t.position)],
);

/* ------------------------------------------------------------------ */
/* Scheduling                                                           */
/* ------------------------------------------------------------------ */

export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    /** Bitmask, Sunday = bit 0 ... Saturday = bit 6. 127 = every day. */
    weekdayMask: smallint("weekday_mask").notNull().default(127),
    startMinute: smallint("start_minute").notNull().default(0),
    endMinute: smallint("end_minute").notNull().default(1440),
    /** Higher wins when two schedules overlap. */
    priority: smallint("priority").notNull().default(0),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("schedules_device_idx").on(t.deviceId)],
);

/* ------------------------------------------------------------------ */
/* Telemetry                                                            */
/* ------------------------------------------------------------------ */

export const deviceCommands = pgTable(
  "device_commands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    kind: commandKindEnum("kind").notNull(),
    payload: jsonb("payload"),
    status: commandStatusEnum("status").notNull().default("queued"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [index("device_commands_device_status_idx").on(t.deviceId, t.status)],
);

export const playbackEvents = pgTable(
  "playback_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    playlistId: uuid("playlist_id").references(() => playlists.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    completed: boolean("completed").notNull().default(true),
  },
  (t) => [index("playback_events_org_started_idx").on(t.organizationId, t.startedAt)],
);

/* ------------------------------------------------------------------ */
/* Add-on: sistema de chamada de senhas                                */
/* ------------------------------------------------------------------ */

/**
 * One panel per screen. Holds the credentials of the operator that only ever
 * manages queue calls — never the Studio. Password is stored hashed.
 */
export const queuePanels = pgTable(
  "queue_panels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    isEnabled: boolean("is_enabled").notNull().default(true),
    /** "sequential" = só o número · "sector" = setor + número. */
    mode: text("mode").notNull().default("sequential"),
    /** Prefix used in sequential mode ("A" -> A001). Optional. */
    prefix: text("prefix"),
    lastNumber: integer("last_number").notNull().default(0),
    /** Seconds the call stays on the TV before playback resumes. */
    displaySeconds: integer("display_seconds").notNull().default(20),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("queue_panels_device_unique").on(t.deviceId),
    uniqueIndex("queue_panels_username_unique").on(t.username),
  ],
);

export const queueSectors = pgTable(
  "queue_sectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    panelId: uuid("panel_id")
      .notNull()
      .references(() => queuePanels.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix"),
    lastNumber: integer("last_number").notNull().default(0),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("queue_sectors_panel_idx").on(t.panelId, t.position)],
);

export const queueCalls = pgTable(
  "queue_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    panelId: uuid("panel_id")
      .notNull()
      .references(() => queuePanels.id, { onDelete: "cascade" }),
    sectorId: uuid("sector_id").references(() => queueSectors.id, { onDelete: "set null" }),
    /** Snapshot of the sector name, so history survives a rename/removal. */
    sectorName: text("sector_name"),
    number: integer("number").notNull(),
    /** Ready-to-show ticket ("A012", "032"). */
    label: text("label").notNull(),
    /** Sentence the TV speaks out loud. */
    spokenText: text("spoken_text").notNull(),
    /** Bumped when the operator repeats the same call. */
    repeatCount: integer("repeat_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    calledAt: timestamp("called_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("queue_calls_panel_idx").on(t.panelId, t.calledAt)],
);

/** Operator sessions of the queue panel. Separate from Studio sessions. */
export const queueSessions = pgTable(
  "queue_sessions",
  {
    id: text("id").primaryKey(),
    panelId: uuid("panel_id")
      .notNull()
      .references(() => queuePanels.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("queue_sessions_panel_idx").on(t.panelId)],
);

/* ------------------------------------------------------------------ */
/* Relations                                                            */
/* ------------------------------------------------------------------ */

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  devices: many(devices),
  playlists: many(playlists),
  mediaAssets: many(mediaAssets),
  locations: many(locations),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  roles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [devices.organizationId],
    references: [organizations.id],
  }),
  location: one(locations, { fields: [devices.locationId], references: [locations.id] }),
  schedules: many(schedules),
  commands: many(deviceCommands),
}));

export const playlistsRelations = relations(playlists, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [playlists.organizationId],
    references: [organizations.id],
  }),
  items: many(playlistItems),
}));

export const playlistItemsRelations = relations(playlistItems, ({ one }) => ({
  playlist: one(playlists, { fields: [playlistItems.playlistId], references: [playlists.id] }),
  mediaAsset: one(mediaAssets, {
    fields: [playlistItems.mediaAssetId],
    references: [mediaAssets.id],
  }),
}));

export const schedulesRelations = relations(schedules, ({ one }) => ({
  device: one(devices, { fields: [schedules.deviceId], references: [devices.id] }),
  playlist: one(playlists, { fields: [schedules.playlistId], references: [playlists.id] }),
}));

export type AppRole = (typeof appRoleEnum.enumValues)[number];