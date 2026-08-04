import { relations, sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
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
export const mediaKindEnum = pgEnum("media_kind", ["image", "video", "web", "widget", "stream"]);
export const mediaStatusEnum = pgEnum("media_status", ["uploading", "ready", "failed"]);
export const deviceStatusEnum = pgEnum("device_status", ["pending", "active", "blocked"]);
export const commandKindEnum = pgEnum("command_kind", [
  "reload",
  "restart",
  "screenshot",
  "sync_playlist",
  "update_app",
  /** Wipes every local file/cache of the player and reloads it. */
  "clear_cache",
  /** Reboots the device itself (Android box/TV), not just the app. */
  "reboot",
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
  /**
   * Per-screen monthly price. When greater than zero the account is billed per
   * active screen (prorated by day), instead of the flat `priceCents`.
   */
  pricePerDeviceCents: integer("price_per_device_cents").notNull().default(0),
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

/** Public website content edited by platform staff without rebuilding the app. */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value")
    .notNull()
    .default(sql`'{}'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  /** Per-account override of the plan's per-screen price (cents). */
  pricePerDeviceOverride: integer("price_per_device_override"),
  /** Day the billing cycle started; every cycle runs anchor + N months. */
  billingAnchorAt: timestamp("billing_anchor_at", { withTimezone: true }),
  adminNotes: text("admin_notes"),
  /** Default WhatsApp recipient for device alerts; usable only after OTP verification. */
  alertWhatsapp: text("alert_whatsapp"),
  alertWhatsappVerifiedAt: timestamp("alert_whatsapp_verified_at", { withTimezone: true }),
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
    /**
     * Optional custom render resolution, in pixels. Used by panels with unusual
     * shapes (LED strips, stacked totems): the player renders at exactly this
     * size and scales it to fit the physical screen. Null = use the panel size.
     */
    screenWidth: integer("screen_width"),
    screenHeight: integer("screen_height"),
    appVersion: text("app_version"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    lastScreenshotKey: text("last_screenshot_key"),
    lastScreenshotAt: timestamp("last_screenshot_at", { withTimezone: true }),
    /** Weekly windows when this screen is expected to be online (monitoring only). */
    operatingHours: jsonb("operating_hours")
      .notNull()
      .default(sql`'[]'::jsonb`),
    offlineAlertsEnabled: boolean("offline_alerts_enabled").notNull().default(false),
    recoveryAlertsEnabled: boolean("recovery_alerts_enabled").notNull().default(true),
    offlineToleranceMinutes: smallint("offline_tolerance_minutes").notNull().default(5),
    /** Optional verified recipient overriding the organization's default number. */
    alertWhatsapp: text("alert_whatsapp"),
    alertWhatsappVerifiedAt: timestamp("alert_whatsapp_verified_at", { withTimezone: true }),
    offlineAlertSentAt: timestamp("offline_alert_sent_at", { withTimezone: true }),
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
    mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, { onDelete: "cascade" }),
    /** A row targets either a media asset or another playlist, never both. */
    nestedPlaylistId: uuid("nested_playlist_id").references(() => playlists.id, {
      onDelete: "cascade",
    }),
    /** Availability rules for this nested insertion; [] means always available. */
    scheduleRules: jsonb("schedule_rules")
      .notNull()
      .default(sql`'[]'::jsonb`),
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
    /** New schedules use a friendly rule type/config; legacy weekly fields remain compatible. */
    ruleType: text("rule_type").notNull().default("weekly_time"),
    ruleConfig: jsonb("rule_config")
      .notNull()
      .default(sql`'{}'::jsonb`),
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
    /**
     * Numeração quando setorizado: "sector" = cada setor tem sua própria
     * sequência · "global" = uma única sequência para todos os setores.
     */
    numberingScope: text("numbering_scope").notNull().default("sector"),
    /** "priority" = preferenciais primeiro · "alternate" = 1 preferencial / 1 normal. */
    priorityPolicy: text("priority_policy").notNull().default("priority"),
    /** Última natureza chamada, usada pela política intercalada. */
    lastCalledKind: text("last_called_kind").notNull().default("normal"),
    /** Prefixo opcional das senhas preferenciais ("P" -> P001). */
    priorityPrefix: text("priority_prefix"),
    /** Token da tela de emissão (totem), sem login. */
    kioskToken: text("kiosk_token"),
    /** Código de pareamento alfanumérico para o impressor desktop (Windows/Linux). */
    /** Emissão de senhas liberada no terminal (/emitir) para esta tela. */
    issuingEnabled: boolean("issuing_enabled").notNull().default(true),
    /** Prefix used in sequential mode ("A" -> A001). Optional. */
    prefix: text("prefix"),
    lastNumber: integer("last_number").notNull().default(0),
    /** Sequência paralela das senhas preferenciais (P001, P002...). */
    lastPriorityNumber: integer("last_priority_number").notNull().default(0),
    /** Seconds the call stays on the TV before playback resumes. */
    displaySeconds: integer("display_seconds").notNull().default(20),
    /** Aparência da chamada na TV (personalizável no Studio). */
    themeBgColor: text("theme_bg_color").notNull().default("#000000"),
    themeBgMediaId: uuid("theme_bg_media_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    themeTicketColor: text("theme_ticket_color").notNull().default("#ffffff"),
    themeTextColor: text("theme_text_color").notNull().default("#38bdf8"),
    themeHistoryColor: text("theme_history_color").notNull().default("#ffffff"),
    /** Aparência da tela de emissão (totem/celular), personalizável no Studio. */
    kioskBgColor: text("kiosk_bg_color").notNull().default("#0b1220"),
    kioskBgMediaId: uuid("kiosk_bg_media_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    kioskCardColor: text("kiosk_card_color").notNull().default("#111a2e"),
    kioskTitleColor: text("kiosk_title_color").notNull().default("#ffffff"),
    kioskTextColor: text("kiosk_text_color").notNull().default("#cbd5f5"),
    kioskNormalButtonColor: text("kiosk_normal_button_color").notNull().default("#2563eb"),
    kioskNormalButtonTextColor: text("kiosk_normal_button_text_color").notNull().default("#ffffff"),
    kioskPriorityButtonColor: text("kiosk_priority_button_color").notNull().default("#f59e0b"),
    kioskPriorityButtonTextColor: text("kiosk_priority_button_text_color")
      .notNull()
      .default("#0b1220"),
    /** Título exibido no topo da emissão. `null` usa "Retire sua senha". */
    kioskTitle: text("kiosk_title"),
    kioskShowLogo: boolean("kiosk_show_logo").notNull().default(true),
    /** Altura da logo na tela de emissão, em pixels. */
    kioskLogoHeight: integer("kiosk_logo_height").notNull().default(96),
    /** Tom de chamada personalizado (MP3 enviado pelo cliente), no MinIO. */
    chimeStorageKey: text("chime_storage_key"),
    chimeName: text("chime_name"),
    /** Volume do tom de chamada, 0-100. */
    chimeVolume: integer("chime_volume").notNull().default(55),
    /** Volume da locução, 0-300 (acima de 100 amplifica a fala). */
    voiceVolume: integer("voice_volume").notNull().default(200),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("queue_panels_device_unique").on(t.deviceId),
    uniqueIndex("queue_panels_username_unique").on(t.username),
  ],
);

/**
 * Desktop emitters register themselves before they belong to a customer. The
 * raw device token never reaches the database; only its SHA-256 hash does.
 */
export const queueEmitters = pgTable(
  "queue_emitters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    panelId: uuid("panel_id").references(() => queuePanels.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Terminal emissor"),
    pairingCode: text("pairing_code"),
    pairingExpiresAt: timestamp("pairing_expires_at", { withTimezone: true }),
    tokenHash: text("token_hash").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("queue_emitters_pairing_code_unique").on(t.pairingCode),
    uniqueIndex("queue_emitters_token_hash_unique").on(t.tokenHash),
    index("queue_emitters_panel_idx").on(t.panelId),
  ],
);

export const whatsappVerifications = pgTable(
  "whatsapp_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: smallint("attempts").notNull().default(0),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("whatsapp_verifications_org_phone_idx").on(t.organizationId, t.phone)],
);

export const deviceNotificationLogs = pgTable(
  "device_notification_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    recipient: text("recipient").notNull(),
    status: text("status").notNull().default("pending"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("device_notification_logs_device_idx").on(t.deviceId, t.createdAt)],
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
    /** Sequência paralela das preferenciais desta fila. */
    lastPriorityNumber: integer("last_priority_number").notNull().default(0),
    position: integer("position").notNull().default(0),
    /**
     * Quantidade de senhas disponíveis por dia nesta fila. `null` = ilimitado.
     * Ao esgotar, a emissão recusa novas senhas até o dia seguinte (ou até o
     * cliente zerar o contador).
     */
    dailyLimit: integer("daily_limit"),
    /** Fila disponível para emissão de senhas no terminal (/emitir). */
    issuingEnabled: boolean("issuing_enabled").notNull().default(true),
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
    /** Guichê que chamou (operador) e o rótulo mostrado/falado na TV. */
    operatorId: uuid("operator_id"),
    deskLabel: text("desk_label"),
    number: integer("number").notNull(),
    /** Ready-to-show ticket ("A012", "032"). */
    label: text("label").notNull(),
    /** Sentence the TV speaks out loud. */
    spokenText: text("spoken_text").notNull(),
    /** Bumped when the operator repeats the same call. */
    repeatCount: integer("repeat_count").notNull().default(0),
    /** "normal" ou "priority" (atendimento preferencial). */
    kind: text("kind").notNull().default("normal"),
    /** Senha emitida que originou a chamada, quando houver. */
    ticketId: uuid("ticket_id"),
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
    operatorId: uuid("operator_id").references(() => queueOperators.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("queue_sessions_panel_idx").on(t.panelId)],
);

/** Logins de operador de um painel. Cada um só chama as filas designadas. */
export const queueOperators = pgTable(
  "queue_operators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    panelId: uuid("panel_id")
      .notNull()
      .references(() => queuePanels.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Operador"),
    /**
     * Guichê/mesa deste operador ("Guichê 01"). Quando definido, a TV exibe e
     * fala este rótulo na chamada, mesmo em fila comum (sem setores).
     */
    deskLabel: text("desk_label"),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("queue_operators_username_unique").on(t.username),
    index("queue_operators_panel_idx").on(t.panelId),
  ],
);

/** Setores que cada operador pode chamar. Sem linhas = todos os setores. */
export const queueOperatorSectors = pgTable(
  "queue_operator_sectors",
  {
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => queueOperators.id, { onDelete: "cascade" }),
    sectorId: uuid("sector_id")
      .notNull()
      .references(() => queueSectors.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.operatorId, t.sectorId] })],
);

/** Senhas emitidas na recepção/totem, aguardando chamada. */
export const queueTickets = pgTable(
  "queue_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    panelId: uuid("panel_id")
      .notNull()
      .references(() => queuePanels.id, { onDelete: "cascade" }),
    sectorId: uuid("sector_id").references(() => queueSectors.id, { onDelete: "set null" }),
    sectorName: text("sector_name"),
    /** "normal" ou "priority". */
    kind: text("kind").notNull().default("normal"),
    number: integer("number").notNull(),
    label: text("label").notNull(),
    /** "waiting" | "called" | "cancelled". */
    status: text("status").notNull().default("waiting"),
    /** Guichê que assumiu a senha ao chamá-la. */
    calledByOperatorId: uuid("called_by_operator_id"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    calledAt: timestamp("called_at", { withTimezone: true }),
  },
  (t) => [index("queue_tickets_panel_status_idx").on(t.panelId, t.status, t.issuedAt)],
);

/* ------------------------------------------------------------------ */
/* Relations                                                            */
/* ------------------------------------------------------------------ */

/**
 * Ledger of the per-screen billing model: every active screen accrues a
 * prorated charge for the current cycle, and every screen removed mid-cycle
 * gets a credit for the days it will not be used.
 */
export const billingEntries = pgTable(
  "billing_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Kept even after the screen row is deleted, so history stays readable. */
    deviceId: uuid("device_id"),
    deviceName: text("device_name").notNull().default("Tela"),
    /** "charge" = tela ativa no ciclo · "credit" = devolução por desvínculo. */
    kind: text("kind").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    /** First day actually billed (link date, or the cycle start). */
    chargedFrom: timestamp("charged_from", { withTimezone: true }).notNull(),
    days: integer("days").notNull().default(0),
    cycleDays: integer("cycle_days").notNull().default(30),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    /** Positive for charges, negative for credits. */
    amountCents: integer("amount_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("billing_entries_org_period_idx").on(t.organizationId, t.periodStart),
    uniqueIndex("billing_entries_unique_kind_idx").on(
      t.organizationId,
      t.deviceId,
      t.periodStart,
      t.kind,
    ),
  ],
);

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
