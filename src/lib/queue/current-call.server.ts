import { desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";
import { CALL_LAYOUT_DEFAULT, resolveQueueLayout, type QueueLayout } from "@/lib/queue/queue-layout";

export type QueueCallHistoryItem = { label: string; sectorName: string | null };

/** Aparência da chamada, configurada pelo cliente no Studio. */
export type QueueCallTheme = {
  bgColor: string;
  bgImageUrl: string | null;
  imageUrl: string | null;
  /** Stable storage key used by native players to cache the free image. */
  imageKey: string | null;
  overlayColor: string;
  overlayOpacity: number;
  overlayGradient: boolean;
  ticketColor: string;
  textColor: string;
  historyColor: string;
  layout: QueueLayout;
};

export type QueueCallPayload = {
  /** Unique per announcement: repeats change it, so the TV calls again. */
  id: string;
  label: string;
  sectorName: string | null;
  spokenText: string;
  /** Ready-made MP3 for players without a speech engine (Roku). */
  audioUrl: string;
  displaySeconds: number;
  calledAt: string;
  /** Chamadas anteriores (mais recente primeiro), exibidas ao lado da atual. */
  history: QueueCallHistoryItem[];
  theme: QueueCallTheme;
  /** Volumes e tom de chamada configurados pelo cliente. */
  sound: {
    /** MP3 personalizado (same-origin) ou null para usar o tom padrão. */
    chimeUrl: string | null;
    /** 0-100 */
    chimeVolume: number;
    /** 0-300 (acima de 100 amplifica a fala) */
    voiceVolume: number;
  };
};

/**
 * Recent queue calls of a screen, oldest first. The player shows them one at a
 * time, respecting the configured display time of each one, so a burst of
 * sector calls becomes a queue instead of overlapping announcements.
 */
export type QueueCallState = { theme: QueueCallTheme | null; calls: QueueCallPayload[] };

export async function queueCallStateForDevice(deviceId: string): Promise<QueueCallState> {
  const db = getDb();

  const panels = await db
    .select({
      id: schema.queuePanels.id,
      isEnabled: schema.queuePanels.isEnabled,
      displaySeconds: schema.queuePanels.displaySeconds,
      themeBgColor: schema.queuePanels.themeBgColor,
      themeBgMediaId: schema.queuePanels.themeBgMediaId,
      themeBgImageKey: schema.queuePanels.themeBgImageKey,
      themeTicketColor: schema.queuePanels.themeTicketColor,
      themeTextColor: schema.queuePanels.themeTextColor,
      themeHistoryColor: schema.queuePanels.themeHistoryColor,
      themeLayout: schema.queuePanels.themeLayout,
      themeImageKey: schema.queuePanels.themeImageKey,
      themeOverlayColor: schema.queuePanels.themeOverlayColor,
      themeOverlayOpacity: schema.queuePanels.themeOverlayOpacity,
      themeOverlayGradient: schema.queuePanels.themeOverlayGradient,
      chimeStorageKey: schema.queuePanels.chimeStorageKey,
      chimeVolume: schema.queuePanels.chimeVolume,
      voiceVolume: schema.queuePanels.voiceVolume,
    })
    .from(schema.queuePanelDevices)
    .innerJoin(schema.queuePanels, eq(schema.queuePanels.id, schema.queuePanelDevices.panelId))
    .where(eq(schema.queuePanelDevices.deviceId, deviceId))
    .limit(1);

  const panel = panels[0];
  if (!panel || !panel.isEnabled) return { theme: null, calls: [] };

  // O arquivo exclusivo tem prioridade. A mídia antiga fica apenas como
  // compatibilidade para clientes que ainda não substituíram a configuração.
  let bgImageUrl: string | null = null;
  let imageUrl: string | null = null;
  if (panel.themeBgImageKey || panel.themeBgMediaId || panel.themeImageKey) {
    try {
      const { isStorageConfigured, createDownloadUrl } = await import("@/lib/storage.server");
      let key = panel.themeBgImageKey;
      if (!key && panel.themeBgMediaId) {
        const asset = await db
          .select({ storageKey: schema.mediaAssets.storageKey, status: schema.mediaAssets.status })
          .from(schema.mediaAssets)
          .where(eq(schema.mediaAssets.id, panel.themeBgMediaId))
          .limit(1);
        key = asset[0]?.status === "ready" ? asset[0]?.storageKey : null;
      }
      if (key && isStorageConfigured()) bgImageUrl = await createDownloadUrl(key, 3600);
      if (panel.themeImageKey && isStorageConfigured()) imageUrl = await createDownloadUrl(panel.themeImageKey, 3600);
    } catch {
      bgImageUrl = null;
    }
  }

  const theme: QueueCallTheme = {
    bgColor: panel.themeBgColor || "#000000",
    bgImageUrl,
    imageUrl,
    imageKey: panel.themeImageKey ?? null,
    overlayColor: panel.themeOverlayColor || "#000000",
    overlayOpacity: Math.max(0, Math.min(100, panel.themeOverlayOpacity ?? 0)),
    overlayGradient: panel.themeOverlayGradient ?? false,
    ticketColor: panel.themeTicketColor || "#ffffff",
    textColor: panel.themeTextColor || "#38bdf8",
    historyColor: panel.themeHistoryColor || "#ffffff",
    layout: resolveQueueLayout(panel.themeLayout, CALL_LAYOUT_DEFAULT),
  };

  const sound = {
    // A versão vem da própria chave do arquivo: ao substituir o tom, a URL muda
    // e nenhum cache (navegador, player Android ou Roku) devolve o som antigo.
    chimeUrl: panel.chimeStorageKey
      ? `/api/public/player/chime?panel=${panel.id}&v=${encodeURIComponent(
          panel.chimeStorageKey.slice(-24),
        )}`
      : null,
    chimeVolume: Math.min(100, Math.max(0, panel.chimeVolume ?? 55)),
    voiceVolume: Math.min(300, Math.max(0, panel.voiceVolume ?? 200)),
  };

  const maxQueued = 8;

  const calls = await db
    .select()
    .from(schema.queueCalls)
    .where(eq(schema.queueCalls.panelId, panel.id))
    .orderBy(desc(schema.queueCalls.calledAt))
    .limit(maxQueued);

  const seconds = Math.max(panel.displaySeconds, 10);
  // Wide enough to cover a queue that is still draining, narrow enough that a
  // screen that reloads does not replay calls from minutes ago.
  const window = (seconds * maxQueued + 15) * 1000;
  const now = Date.now();

  // `calls` vem do mais recente para o mais antigo: o historico de cada chamada
  // sao as que vieram logo antes dela.
  const fresh = calls.filter((call) => now - call.calledAt.getTime() <= window);

  // Older rows (or rows created before the sector snapshot existed) may have a
  // null sectorName: resolve it from the sector table so every player shows the
  // sector, not just the ticket number.
  const missing = Array.from(
    new Set(fresh.filter((c) => !c.sectorName && c.sectorId).map((c) => c.sectorId as string)),
  );
  const sectorNames = new Map<string, string>();
  if (missing.length > 0) {
    const { inArray } = await import("drizzle-orm");
    const rows = await db
      .select({ id: schema.queueSectors.id, name: schema.queueSectors.name })
      .from(schema.queueSectors)
      .where(inArray(schema.queueSectors.id, missing));
    for (const row of rows) sectorNames.set(row.id, row.name);
  }

  const sectorOf = (call: (typeof fresh)[number]): string | null =>
    call.sectorName ?? (call.sectorId ? (sectorNames.get(call.sectorId) ?? null) : null);

  return {
    theme,
    calls: fresh
    .map((call, index) => ({
      id: `${call.id}:${call.repeatCount}`,
      label: call.label,
      sectorName: sectorOf(call),
      spokenText: call.spokenText,
      audioUrl: `/api/public/player/announce?call=${call.id}&r=${call.repeatCount}`,
      displaySeconds: seconds,
      calledAt: call.calledAt.toISOString(),
      theme,
      sound,
      history: calls
        .slice(index + 1)
        .filter((prev) => prev.label !== call.label)
        .slice(0, 3)
        .map((prev) => ({ label: prev.label, sectorName: sectorOf(prev) })),
    }))
      .reverse(),
  };
}
