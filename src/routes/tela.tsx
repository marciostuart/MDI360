import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { WidgetView } from "@/components/widgets/widget-view";
import { QueueCallOverlay, type QueueCallPayload } from "@/components/queue/queue-call-overlay";
import * as mediaCache from "@/lib/player/media-cache";
import { buildYoutubeEmbedUrl, parseYoutubeId } from "@/lib/media/stream-url";
import { matchesScheduleRule, type ScheduleRule } from "@/lib/schedules/rules";
import type { WidgetConfig } from "@/lib/widgets/catalog";

type PlayerItem = {
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

type SyncResponse = {
  suspended?: boolean;
  device: {
    id: string;
    name: string;
    canvasPreset: string;
    audioEnabled?: boolean;
    /** "fade" faz um crossfade suave entre arquivos; "none" corta seco. */
    transitionEffect?: string;
    /** Resolução forçada de renderização (null = tamanho real do painel). */
    screenWidth?: number | null;
    screenHeight?: number | null;
    enabledModes?: string[];
  };
  playlist: { id: string; name: string; revision: number; items: PlayerItem[] } | null;
  offlineSchedule?: {
    fallbackPlaylist: { id: string; name: string; revision: number; items: PlayerItem[] } | null;
    activeRule: ScheduleRule | null;
    preloadItems?: PlayerItem[];
    timezone: string;
    serverTime: string;
  };
  branding: {
    name: string | null;
    splashText: string | null;
    color: string | null;
    logoUrl: string | null;
  } | null;
  commands: string[];
  syncIntervalMs: number;
  revision?: number;
  /** Database-derived plan identity, reliable across server replicas. */
  contentRevision?: string;
  /** Add-on de senhas: chamada mais recente desta tela (null quando inativo). */
  queueCall?: QueueCallPayload | null;
  queueCalls?: QueueCallPayload[] | null;
};

const TOKEN_KEY = "mdi360.deviceToken";
const CODE_KEY = "mdi360.activationCode";
const CACHED_SYNC_KEY = "mdi360.lastSafeSync.v1";
const PLAYBACK_OUTBOX_KEY = "mdi360.playbackOutbox.v1";
const SERVER_CLOCK_OFFSET_KEY = "mdi360.serverClockOffsetMs.v1";
const MAX_PLAYBACK_OUTBOX_ITEMS = 10_000;
const APP_VERSION =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("android") === "hybrid"
    ? "android-hybrid"
    : "web-1.0.0";
const IS_ANDROID_HYBRID =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("android") === "hybrid";
// Depois de uma queda de rede, o APK abre esta mesma rota em modo de
// sincronizacao invisivel. Ela continua buscando revisoes, baixando arquivos e
// enviando relatorios, mas nao volta a controlar a superficie de midia: essa
// superficie ja pertence ao player Kotlin local.
const NATIVE_SYNC_ONLY =
  IS_ANDROID_HYBRID &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("native-sync-only") === "1";
// Prevents Android WebView from showing its default giant play poster while
// the first video frame is being decoded.
const TRANSPARENT_VIDEO_POSTER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

/**
 * Ponte com o aplicativo Android (quando o player roda dentro do APK).
 * No navegador comum ela simplesmente não existe e tudo é ignorado.
 */
type NativeBridge = {
  clearCache?: () => void;
  reboot?: () => void;
  requestScreenshot?: () => void;
  setResolution?: (width: number, height: number) => void;
  version?: () => string;
  nativeMediaSupported?: () => boolean;
  hasValidatedNetwork?: () => boolean;
  cachedMediaKeys?: () => string;
  saveOfflinePlan?: (plan: string) => void;
  drainOfflinePlaybackReports?: () => string;
  acknowledgeOfflinePlaybackReportsThrough?: (id: number) => void;
  playMedia?: (
    itemId: string,
    url: string,
    cacheKey: string,
    muted: boolean,
    loop: boolean,
    fade?: boolean,
  ) => void;
  showImage?: (itemId: string, url: string, cacheKey: string, fade: boolean) => void;
  stopMedia?: () => void;
  preloadMedia?: (items: string) => void;
  startupStage?: (label: string) => void;
  startupComplete?: () => void;
};

type PlaybackOutboxItem = {
  playlistId: string | null;
  mediaAssetId: string | null;
  durationMs: number;
  startedAt: string;
};

type NativePlaybackOutboxItem = PlaybackOutboxItem & {
  _nativeReportId: number;
};

function loadPlaybackOutbox(): PlaybackOutboxItem[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(PLAYBACK_OUTBOX_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (item): item is PlaybackOutboxItem =>
            typeof item?.startedAt === "string" && typeof item?.durationMs === "number",
        )
      : [];
  } catch {
    return [];
  }
}

function persistPlaybackOutbox(items: PlaybackOutboxItem[]) {
  try {
    window.localStorage.setItem(PLAYBACK_OUTBOX_KEY, JSON.stringify(items));
  } catch {
    // A fila e a exibicao nao podem parar se o armazenamento estiver cheio.
  }
}

function nativeBridge(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { MDI360Native?: NativeBridge }).MDI360Native ?? null;
}

function canUseNativeMedia() {
  try {
    return IS_ANDROID_HYBRID && nativeBridge()?.nativeMediaSupported?.() === true;
  } catch {
    // APKs anteriores não possuem esta ponte; eles continuam usando o player
    // WebView sem interrupção até que sejam atualizados.
    return false;
  }
}

/** APK 1.3.1 introduced the sixth bridge argument (fade). */
function supportsNativeFadeBridge(bridge: NativeBridge | null) {
  const match = bridge?.version?.().match(/^android-hybrid-(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const [, major, minor, patch] = match.map(Number);
  return major > 1 || (major === 1 && (minor > 3 || (minor === 3 && patch >= 1)));
}

/** APK 1.3.15 makes Kotlin the sole owner of file-media playback. */
function supportsNativeLocalController(bridge: NativeBridge | null) {
  const match = bridge?.version?.().match(/^android-hybrid-(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const [, major, minor, patch] = match.map(Number);
  return major > 1 || (major === 1 && (minor > 3 || (minor === 3 && patch >= 15)));
}
/** APK 1.3.9 guarantees that local files are fully cached before playback. */
function supportsNativeLocalCacheBridge(bridge: NativeBridge | null) {
  const match = bridge?.version?.().match(/^android-hybrid-(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const [, major, minor, patch] = match.map(Number);
  return major > 1 || (major === 1 && (minor > 3 || (minor === 3 && patch >= 9)));
}

/**
 * Browsers can reject autoplay when a video has audio. Retry muted only in a
 * normal browser; the Android WebView is explicitly configured to allow
 * media playback with audio and must preserve the customer's audio setting.
 */
async function playWithBrowserFallback(video: HTMLVideoElement) {
  try {
    await video.play();
  } catch {
    if (nativeBridge()) {
      // Do not mute Android as a fallback: that would break audio and can
      // leave the WebView's native play overlay visible on the next item.
      return;
    }
    video.muted = true;
    try {
      await video.play();
    } catch {
      // The normal media error handler/watchdog will recover if necessary.
    }
  }
}

/** Apaga só os arquivos em cache, mantendo o vínculo desta tela. */
async function clearMediaCache() {
  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((key) => caches.delete(key)));
    } catch {
      // Cache API indisponível neste aparelho.
    }
  }
}

/**
 * Wipes everything this screen cached locally. Runs when the customer deletes
 * the screen in the Studio, so the device never keeps showing stale content.
 */
async function wipeLocalCache() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(CODE_KEY);
  window.localStorage.removeItem(CACHED_SYNC_KEY);
  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((key) => caches.delete(key)));
    } catch {
      // Cache API unavailable on this device; nothing else to clean.
    }
  }
}

/** Duration of the soft transition, used both on entry and on exit. */
const FADE_MS = 700;

export const Route = createFileRoute("/tela")({
  head: () => ({
    meta: [
      { title: "Player | MDI 360" },
      { name: "description", content: "Player de exibição para TVs e totens do MDI 360." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Player MDI 360" },
      { property: "og:description", content: "Player de exibição para TVs e totens." },
    ],
  }),
  component: PlayerScreen,
});

function PlayerScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [activationCode, setActivationCode] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [videoPlayingKey, setVideoPlayingKey] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  /** Ultimo sinal de vida geral, usado quando ainda nao ha midia carregada. */
  const beatRef = useRef<number>(Date.now());
  /** Ultimo avanco real da midia atual. Sincronizacao nao renova este relogio. */
  const mediaProgressRef = useRef<number>(Date.now());
  const revisionRef = useRef(0);
  const contentRevisionRef = useRef("");
  // Sync data that arrived while a file was on screen. It is only applied on
  // the next item boundary so nothing is ever cut mid-exhibition.
  const pendingSyncRef = useRef<SyncResponse | null>(null);
  const pendingSyncTimerRef = useRef<number | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const syncRef = useRef<SyncResponse | null>(null);
  // URLs already fully downloaded to this device. A file only enters the
  // rotation after its download finishes, so the TV never buffers on air.
  const [readyUrls, setReadyUrls] = useState<Set<string>>(new Set());
  // Confirmacoes emitidas pelo APK depois que o arquivo inteiro foi gravado
  // no cache nativo. A partir da versao 1.3.9, nenhum arquivo e reproduzido
  // antes desta confirmacao.
  const [nativeCachedKeys, setNativeCachedKeys] = useState<Set<string>>(new Set());
  const [localSrc, setLocalSrc] = useState<string | null>(null);
  // Android's navigator.onLine only reports the Wi-Fi link. The APK exposes
  // the validated route so an image never falls back to a dead signed URL.
  const [networkAvailable, setNetworkAvailable] = useState(() => {
    const browserOnline = typeof navigator === "undefined" ? true : navigator.onLine;
    try {
      return nativeBridge()?.hasValidatedNetwork?.() ?? browserOnline;
    } catch {
      return browserOnline;
    }
  });
  // Eventos de exibicao sobrevivem a queda de rede e sao enviados na mesma
  // ordem quando a conexao volta. O horario e registrado no instante local em
  // que o item entrou na rotacao, nunca no instante posterior do reenvio.
  const playbackOutboxRef = useRef<PlaybackOutboxItem[]>([]);
  const storedClockOffset =
    typeof window === "undefined"
      ? 0
      : Number(window.localStorage.getItem(SERVER_CLOCK_OFFSET_KEY) ?? "0");
  const serverClockOffsetRef = useRef<number>(
    Number.isFinite(storedClockOffset) ? storedClockOffset : 0,
  );
  const playbackFlushRunningRef = useRef(false);
  const leaveRef = useRef<number | null>(null);
  /** True during the last FADE_MS of an item, so it fades out before swapping. */
  const [leaving, setLeaving] = useState(false);
  const [widgetReadyKey, setWidgetReadyKey] = useState<string | null>(null);
  // Queue add-on: the call currently taking over the screen, plus the ones
  // waiting for their turn. Calls never overlap: each one owns the screen for
  // its full display time before the next enters.
  const [activeCall, setActiveCall] = useState<QueueCallPayload | null>(null);
  const fade = sync?.device?.transitionEffect === "fade";
  const activeCallRef = useRef<QueueCallPayload | null>(null);
  const waitingCallsRef = useRef<QueueCallPayload[]>([]);
  const seenCallIdsRef = useRef<Set<string>>(new Set());
  const nativePlaybackReceiverRef = useRef<(event: string, itemId: string, detail: string) => void>(
    () => {},
  );

  useEffect(() => {
    const receiver = (event: string, itemId: string, detail: string) => {
      if (event === "cached") {
        setNativeCachedKeys((previous) => {
          if (previous.has(detail)) return previous;
          const next = new Set(previous);
          next.add(detail);
          return next;
        });
        return;
      }
      if (event === "cache-miss") {
        setNativeCachedKeys((previous) => {
          if (!previous.has(detail)) return previous;
          const next = new Set(previous);
          next.delete(detail);
          return next;
        });
        return;
      }
      nativePlaybackReceiverRef.current(event, itemId, detail);
    };
    // O APK pode terminar o primeiro download antes que exista uma midia
    // selecionada pela rotacao. Este receptor precisa ficar exposto desde a
    // montagem da tela para receber o "cached" inicial.
    (window as unknown as { __mdi360NativeMediaEvent?: typeof receiver }).__mdi360NativeMediaEvent =
      receiver;
    return () => {
      if (
        (window as unknown as { __mdi360NativeMediaEvent?: typeof receiver })
          .__mdi360NativeMediaEvent === receiver
      ) {
        delete (window as unknown as { __mdi360NativeMediaEvent?: typeof receiver })
          .__mdi360NativeMediaEvent;
      }
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      const browserOnline = navigator.onLine;
      try {
        setNetworkAvailable(nativeBridge()?.hasValidatedNetwork?.() ?? browserOnline);
      } catch {
        setNetworkAvailable(browserOnline);
      }
    };
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.clearInterval(timer);
    };
  }, []);

  // A confirmacao de cache nao pode viver somente na memoria do React. Caso
  // uma oscilacao reinicie o renderer da WebView, reidratamos a lista a partir
  // do manifesto persistente do APK antes de montar a rotacao.
  useEffect(() => {
    try {
      const raw = nativeBridge()?.cachedMediaKeys?.();
      if (!raw) return;
      const keys = JSON.parse(raw) as unknown;
      if (!Array.isArray(keys)) return;
      setNativeCachedKeys(new Set(keys.filter((key): key is string => typeof key === "string")));
    } catch {
      // Versoes anteriores do APK continuam pelo preload em segundo plano.
    }
  }, []);

  /** Shows the next waiting call, or releases the screen back to the playlist. */
  const startNextCall = useCallback(() => {
    const next = waitingCallsRef.current.shift() ?? null;
    activeCallRef.current = next;
    beatRef.current = Date.now();
    mediaProgressRef.current = Date.now();
    setActiveCall(next);
  }, []);

  /** Adds freshly arrived calls to the queue without disturbing the current one. */
  const enqueueCalls = useCallback(
    (calls: QueueCallPayload[]) => {
      let added = false;
      for (const call of calls) {
        if (!call?.id) continue;

        // Presentation settings can change while a call is on screen or still
        // waiting. Refresh that payload in place, without replaying the call.
        if (activeCallRef.current?.id === call.id) {
          activeCallRef.current = call;
          setActiveCall(call);
          continue;
        }
        const waitingIndex = waitingCallsRef.current.findIndex((item) => item.id === call.id);
        if (waitingIndex >= 0) {
          waitingCallsRef.current[waitingIndex] = call;
          continue;
        }
        if (seenCallIdsRef.current.has(call.id)) continue;
        seenCallIdsRef.current.add(call.id);
        waitingCallsRef.current.push(call);
        added = true;
      }
      if (added && !activeCallRef.current) startNextCall();
    },
    [startNextCall],
  );

  const applySync = useCallback((data: SyncResponse, resetIndex: boolean) => {
    if (pendingSyncTimerRef.current !== null) {
      window.clearTimeout(pendingSyncTimerRef.current);
      pendingSyncTimerRef.current = null;
    }
    pendingSyncRef.current = null;
    setHasPending(false);
    syncRef.current = data;
    setSync(data);
    if (resetIndex) {
      beatRef.current = Date.now();
      mediaProgressRef.current = Date.now();
      setIndex(0);
    }
  }, []);

  useEffect(
    () => () => {
      if (pendingSyncTimerRef.current !== null) window.clearTimeout(pendingSyncTimerRef.current);
    },
    [],
  );

  const persistSafeSync = useCallback((data: SyncResponse) => {
    try {
      // Never replay old queue calls or remote commands after an offline boot.
      window.localStorage.setItem(
        CACHED_SYNC_KEY,
        JSON.stringify({ ...data, queueCall: null, queueCalls: [], commands: [] }),
      );
    } catch {
      // A full localStorage must not interrupt playback.
    }
  }, []);

  /**
   * Moves to the next item. If a newer playlist/settings payload is waiting,
   * this is the moment it takes effect.
   */
  const advance = useCallback(() => {
    beatRef.current = Date.now();
    mediaProgressRef.current = Date.now();
    const pending = pendingSyncRef.current;
    if (pending) {
      applySync(pending, true);
      return;
    }
    setIndex((value) => value + 1);
  }, [applySync]);

  /** Announces this screen to the server and reserves an activation code. */
  const register = useCallback(async () => {
    try {
      const response = await fetch("/api/public/player/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appVersion: APP_VERSION }),
      });
      if (!response.ok) throw new Error("register");
      const data = (await response.json()) as { deviceToken: string; activationCode: string };
      window.localStorage.setItem(TOKEN_KEY, data.deviceToken);
      window.localStorage.setItem(CODE_KEY, data.activationCode);
      setToken(data.deviceToken);
      setActivationCode(data.activationCode);
      setLinked(false);
      setError(null);
    } catch {
      setError("Sem conexão com o servidor. Tentando novamente…");
    }
  }, []);

  /** Forgets this screen locally and asks the server for a brand-new code. */
  const resetDevice = useCallback(async () => {
    await wipeLocalCache();
    setToken(null);
    setSync(null);
    setLinked(false);
    setActivationCode(null);
    await register();
  }, [register]);

  // localStorage is only available after hydration.
  useEffect(() => {
    playbackOutboxRef.current = loadPlaybackOutbox();
    const stored = window.localStorage.getItem(TOKEN_KEY);
    setToken(stored);
    setActivationCode(window.localStorage.getItem(CODE_KEY));
    if (stored) {
      try {
        const cached = JSON.parse(
          window.localStorage.getItem(CACHED_SYNC_KEY) ?? "null",
        ) as SyncResponse | null;
        if (cached?.device) {
          const rule = cached.offlineSchedule?.activeRule;
          const timezone = cached.offlineSchedule?.timezone ?? "America/Sao_Paulo";
          const safe =
            rule && !matchesScheduleRule(rule, new Date(), timezone)
              ? {
                  ...cached,
                  playlist: cached.offlineSchedule?.fallbackPlaylist ?? null,
                  offlineSchedule: cached.offlineSchedule
                    ? { ...cached.offlineSchedule, activeRule: null }
                    : undefined,
                }
              : cached;
          applySync(safe, true);
          setLinked(true);
        }
      } catch {
        window.localStorage.removeItem(CACHED_SYNC_KEY);
      }
    }
    setReady(true);
    if (!stored) void register();
  }, [register, applySync]);

  // While unlinked, poll until the customer claims the code in the Studio.
  useEffect(() => {
    if (!token || linked) return;
    let cancelled = false;

    const check = async (wait: boolean) => {
      try {
        const response = await fetch("/api/public/player/status", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ wait }),
        });
        if (response.status === 401) {
          await resetDevice();
          return false;
        }
        const data = (await response.json()) as {
          state: "waiting" | "linked" | "blocked";
          activationCode?: string | null;
        };
        if (cancelled) return false;
        setError(null);
        if (data.state === "linked") {
          setLinked(true);
          return true;
        } else if (data.state === "waiting" && data.activationCode) {
          setActivationCode(data.activationCode);
          window.localStorage.setItem(CODE_KEY, data.activationCode);
        }
        return false;
      } catch {
        if (!cancelled) setError("Sem conexão com o servidor. Tentando novamente…");
        await new Promise((resolve) => window.setTimeout(resolve, 5_000));
        return false;
      }
    };

    // Push channel for unlinked screens: the request stays open and the server
    // answers the moment the code is claimed (or the screen is replaced), so
    // linking and "Substituir tela" are immediate.
    void (async () => {
      let first = true;
      while (!cancelled) {
        const linkedNow = await check(!first);
        first = false;
        if (linkedNow) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, linked, resetDevice]);

  const runSync = useCallback(
    async (deviceToken: string) => {
      try {
        nativeBridge()?.startupStage?.("Conectando ao servidor");
        const response = await fetch("/api/public/player/sync", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${deviceToken}`,
          },
          body: JSON.stringify({ appVersion: APP_VERSION, deviceClockMs: Date.now() }),
        });
        if (response.status === 401) {
          // The screen was deleted or unlinked in the Studio.
          await resetDevice();
          return;
        }
        if (!response.ok) throw new Error(`sync ${response.status}`);
        const data = (await response.json()) as SyncResponse;
        const serverTime = Date.parse(data.offlineSchedule?.serverTime ?? "");
        if (Number.isFinite(serverTime)) {
          const offset = serverTime - Date.now();
          serverClockOffsetRef.current = offset;
          try {
            window.localStorage.setItem(SERVER_CLOCK_OFFSET_KEY, String(offset));
          } catch {
            // Reports still use the in-memory correction if storage is unavailable.
          }
        }
        nativeBridge()?.startupStage?.("Programação recebida");
        persistSafeSync(data);
        try {
          nativeBridge()?.saveOfflinePlan?.(JSON.stringify(data));
        } catch {
          // O localStorage continua como segunda camada de seguranca.
        }
        if (typeof data.revision === "number") revisionRef.current = data.revision;
        if (typeof data.contentRevision === "string") contentRevisionRef.current = data.contentRevision;

        // A ticket call NEVER waits for the current file: it takes over now.
        // Several calls in a row are queued and shown one after the other.
        const incoming = data.queueCalls ?? (data.queueCall ? [data.queueCall] : []);
        enqueueCalls(incoming);

        const previous = syncRef.current;
        const playing = (previous?.playlist?.items?.length ?? 0) > 0;
        const changed =
          previous?.playlist?.revision !== data.playlist?.revision ||
          previous?.device?.audioEnabled !== data.device?.audioEnabled ||
          previous?.device?.transitionEffect !== data.device?.transitionEffect;
        if (!playing || !changed) {
          applySync(data, changed);
        } else {
          // Finish the current item when possible, but never leave a long
          // video/widgets waiting minutes after a Studio update.
          pendingSyncRef.current = data;
          setHasPending(true);
          if (pendingSyncTimerRef.current !== null) window.clearTimeout(pendingSyncTimerRef.current);
          pendingSyncTimerRef.current = window.setTimeout(() => {
            if (pendingSyncRef.current === data) applySync(data, true);
          }, 10_000);
        }
        // Comandos remotos enviados pelo Studio.
        const native = nativeBridge();
        if (data.commands.includes("screenshot")) {
          // Captura feita pelo aplicativo Android; o envio acontece no callback.
          native?.requestScreenshot?.();
        }
        if (data.commands.includes("reboot")) {
          if (native?.reboot) {
            native.reboot();
          } else {
            window.location.reload();
          }
          return;
        }
        if (data.commands.includes("clear_cache")) {
          await clearMediaCache();
          native?.clearCache?.();
          window.location.reload();
          return;
        }
        if (data.commands.includes("reload") || data.commands.includes("restart")) {
          window.location.reload();
        }
        setError(null);
      } catch (cause) {
        console.error("[player] falha ao sincronizar:", cause);
        setError("Sem conexão com o servidor. Tentando novamente…");
      }
    },
    [resetDevice, applySync, enqueueCalls, persistSafeSync],
  );

  // A scheduled playlist is authorized by the server, but its end is also
  // enforced by the device clock. If connectivity disappears, expired content
  // is replaced by the cached default playlist instead of remaining on air.
  useEffect(() => {
    const enforce = () => {
      const currentSync = syncRef.current;
      const policy = currentSync?.offlineSchedule;
      if (!currentSync || !policy?.activeRule) return;
      if (matchesScheduleRule(policy.activeRule, new Date(), policy.timezone)) return;
      const safe: SyncResponse = {
        ...currentSync,
        playlist: policy.fallbackPlaylist,
        offlineSchedule: { ...policy, activeRule: null },
      };
      persistSafeSync(safe);
      applySync(safe, true);
    };
    enforce();
    const clock = window.setInterval(enforce, 15_000);
    return () => window.clearInterval(clock);
  }, [applySync, persistSafeSync]);

  useEffect(() => {
    if (!token || !linked) return;
    void runSync(token);

    // Safety net: even if a different Swarm replica owns the push channel,
    // the screen reconciles quickly. Applying a new plan still waits for an
    // item boundary, so this never cuts the media currently on air.
    const interval = window.setInterval(() => void runSync(token), 20_000);
    // A screen that linked but never received its first payload must not sit on
    // the splash for a whole minute: retry fast until content arrives.
    const bootstrap = window.setInterval(() => {
      if (!syncRef.current) void runSync(token);
    }, 5_000);

    // Push channel: one long-poll request that the server answers the instant
    // something changes for this screen. Costs a single idle connection.
    let stopped = false;
    const listen = async () => {
      while (!stopped) {
        try {
          const response = await fetch("/api/public/player/events", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              revision: revisionRef.current,
              contentRevision: contentRevisionRef.current,
            }),
          });
          if (stopped) return;
          if (response.status === 401) {
            await resetDevice();
            return;
          }
          if (!response.ok) throw new Error("events");
          const data = (await response.json()) as {
            revision: number;
            contentRevision?: string;
            changed: boolean;
          };
          revisionRef.current = data.revision;
          // Only advance the local content marker after a successful /sync.
          // Otherwise a brief network failure could hide the same change from
          // the next long-poll attempt.
          if (data.changed) await runSync(token);
        } catch {
          // Network hiccup: wait a bit before reopening the channel.
          await new Promise((resolve) => window.setTimeout(resolve, 5_000));
        }
      }
    };
    void listen();

    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.clearInterval(bootstrap);
    };
  }, [token, linked, runSync, resetDevice]);

  const allItems = sync?.playlist?.items ?? [];
  const fallbackItems = sync?.offlineSchedule?.fallbackPlaylist?.items ?? [];
  const preloadItems = sync?.offlineSchedule?.preloadItems ?? [];
  const downloadUrls = [...allItems, ...fallbackItems, ...preloadItems]
    .filter((item) => (item.kind === "image" || item.kind === "video") && item.url)
    .map((item) => item.url as string);
  // Depend on the stable storage paths, never on the signed links: those change
  // on every sync and would restart the downloads (and the video) each minute.
  const downloadKey = downloadUrls.map((url) => mediaCache.keyFor(url)).join("|");
  const downloadUrlsRef = useRef<string[]>(downloadUrls);
  downloadUrlsRef.current = downloadUrls;
  const nativePreloadRef = useRef<Array<{ id: string; url: string; cacheKey: string }>>([]);
  nativePreloadRef.current = [...allItems, ...fallbackItems, ...preloadItems]
    .filter((item) => (item.kind === "video" || item.kind === "image") && Boolean(item.url))
    .map((item) => ({
      id: item.id,
      url: item.url as string,
      cacheKey: item.mediaAssetId ?? item.id,
    }));
  const nativeLocalCacheRequired = supportsNativeLocalCacheBridge(nativeBridge());
  // Widgets, paginas e streams continuam usando a camada visual existente.
  // Para playlists inteiramente compostas por arquivos locais, o Kotlin e o
  // unico dono da reproducao; a WebView fica restrita a sincronizar.
  const nativeLocalPlayback =
    supportsNativeLocalController(nativeBridge()) &&
    allItems.length > 0 &&
    [...allItems, ...fallbackItems].every((item) => item.kind === "image" || item.kind === "video");

  // Downloads missing files in the background and removes from the local cache
  // anything that is no longer in the playlist (e.g. deleted in the Studio).
  useEffect(() => {
    // The current APK owns one persistent native cache for all downloadable
    // files. Do not duplicate downloads in the WebView cache.
    if (nativeLocalCacheRequired) return;
    let cancelled = false;
    const urls = downloadUrlsRef.current.slice();

    const run = async () => {
      const removed = await mediaCache.prune(urls);
      if (removed.length && !cancelled) {
        setReadyUrls((previous) => {
          const next = new Set(previous);
          for (const key of removed) next.delete(key);
          return next;
        });
      }
      for (const url of urls) {
        if (cancelled) return;
        const key = mediaCache.keyFor(url);
        const ok = (await mediaCache.isCached(url)) || (await mediaCache.download(url));
        if (cancelled) return;
        if (ok) {
          setReadyUrls((previous) => {
            if (previous.has(key)) return previous;
            const next = new Set(previous);
            next.add(key);
            return next;
          });
        } else {
          // Download failed (CORS, storage full, private mode…). Retry once and,
          // if it still fails, release the file anyway: streaming straight from
          // the server is far better than a screen stuck on "Baixando".
          const retry = await mediaCache.download(url);
          if (cancelled) return;
          setReadyUrls((previous) => {
            if (previous.has(key)) return previous;
            const next = new Set(previous);
            next.add(key);
            return next;
          });
          if (!retry) console.warn("[player] sem cache local, tocando direto:", url);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [downloadKey, nativeLocalCacheRequired]);

  // Widgets, páginas e streams não têm arquivo; só os arquivos esperam o cache.
  const items = allItems.filter((item) => {
    if (item.kind === "widget" || item.kind === "web" || item.kind === "stream") return true;
    // APK 1.3.9+: arquivos so entram na rotacao depois que o cache nativo
    // confirma o download completo. Nao existe streaming como contingencia.
    if (nativeLocalCacheRequired && (item.kind === "video" || item.kind === "image")) {
      return Boolean(item.url) && nativeCachedKeys.has(item.mediaAssetId ?? item.id);
    }
    // O APK possui um cache persistente proprio para arquivos. Nao espere a
    // Cache API do WebView (que alguns fabricantes limpam ao perder rede).
    if (canUseNativeMedia() && item.kind === "video") return Boolean(item.url);
    // Online, a new image may enter while Cache Storage warms up. Offline it
    // only enters the rotation after the local copy is complete.
    if (IS_ANDROID_HYBRID && item.kind === "image") {
      return (
        Boolean(item.url) &&
        (networkAvailable || readyUrls.has(mediaCache.keyFor(item.url as string)))
      );
    }
    return Boolean(item.url) && readyUrls.has(mediaCache.keyFor(item.url as string));
  });
  const current = items[index % Math.max(items.length, 1)];
  useEffect(() => {
    // Native video closes the startup layer only after ExoPlayer emits ready.
    // Other kinds are ready as soon as React can place their surface.
    if (items.length === 0 || current?.kind === "video" || current?.kind === "image") return;
    nativeBridge()?.startupStage?.("Conteúdos prontos");
    nativeBridge()?.startupComplete?.();
  }, [items.length, current?.kind]);
  // Identity that survives a re-sign of the media link, used for React keys and
  // effect dependencies so the file on screen is never remounted mid-playback.
  const currentKey = current?.url ? mediaCache.keyFor(current.url) : null;
  // Once offline, never point an image at the remote signed link. localSrc is
  // created from Cache Storage and keeps the visible playlist independent of
  // the server connection.
  const imageSrc = localSrc ?? (networkAvailable ? current?.url ?? undefined : undefined);
  const videoRenderKey = current ? `${current.id}-${index}` : null;
  const nativeMediaActive =
    canUseNativeMedia() &&
    nativeLocalCacheRequired &&
    (current?.kind === "video" || current?.kind === "image") &&
    Boolean(current.url);
  const nativeMediaItemId = nativeMediaActive && videoRenderKey ? `native:${videoRenderKey}` : null;
  const nativeMediaCacheKey = current?.mediaAssetId ?? current?.id ?? "";
  const waitsForRemoteWidget =
    current?.kind === "widget" &&
    (current.widgetConfig?.type === "lottery" || current.widgetConfig?.type === "news") &&
    widgetReadyKey !== videoRenderKey;
  const markWidgetReady = useCallback(() => {
    if (videoRenderKey) setWidgetReadyKey(videoRenderKey);
    nativeBridge()?.startupStage?.("Conteúdos prontos");
    nativeBridge()?.startupComplete?.();
  }, [videoRenderKey]);

  // The playlist clock must not consume the lottery cycle while the first
  // payload is still loading. A bounded fallback prevents a provider outage
  // from holding the whole playlist forever.
  useEffect(() => {
    if (
      current?.kind !== "widget" ||
      (current.widgetConfig?.type !== "lottery" && current.widgetConfig?.type !== "news")
    )
      return;
    const fallback = window.setTimeout(() => {
      if (videoRenderKey) setWidgetReadyKey(videoRenderKey);
    }, 20_000);
    return () => window.clearTimeout(fallback);
  }, [current?.kind, current?.widgetConfig?.type, videoRenderKey]);

  // Keep the surface black until the video really starts. This prevents the
  // Android WebView default play artwork from ever becoming visible.
  useEffect(() => {
    setVideoPlayingKey(null);
  }, [videoRenderKey]);

  // Playback always reads from the local copy when there is one.
  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    setLocalSrc(null);
    const url = current?.url;
    if (!url || (current?.kind !== "image" && current?.kind !== "video")) return;
    void mediaCache.localUrl(url).then((objectUrl) => {
      if (!objectUrl) return;
      if (cancelled) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      revoked = objectUrl;
      setLocalSrc(objectUrl);
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, current?.kind, index]);

  // No APK atualizado, vídeos deixam o decoder do WebView e passam ao
  // ExoPlayer nativo. A página segue acima dele para preservar chamadas e
  // demais superfícies híbridas.
  useEffect(() => {
    if (NATIVE_SYNC_ONLY || nativeLocalPlayback) return;
    const native = nativeBridge();
    if (!nativeMediaActive || !nativeMediaItemId || !current?.url) {
      // Enquanto a WebView reidrata o manifesto depois de uma oscilacao,
      // `current` ainda pode estar vazio apesar de o player nativo estar
      // exibindo um arquivo local valido. Nunca interrompa esse caso.
      if (current?.kind && current.kind !== "video" && current.kind !== "image") {
        native?.stopMedia?.();
      }
      return;
    }
    if (current.kind === "image") {
      native.showImage?.(nativeMediaItemId, current.url, nativeMediaCacheKey, fade);
    } else {
      const muted = current.isMuted || sync?.device?.audioEnabled === false || Boolean(activeCall);
      const loop = items.length === 1 && !hasPending;
      if (supportsNativeFadeBridge(native)) {
        native.playMedia?.(nativeMediaItemId, current.url, nativeMediaCacheKey, muted, loop, fade);
      } else {
        native.playMedia?.(nativeMediaItemId, current.url, nativeMediaCacheKey, muted, loop);
      }
    }
  }, [
    nativeMediaActive,
    nativeMediaItemId,
    nativeMediaCacheKey,
    current?.kind,
    current?.url,
    current?.isMuted,
    sync?.device?.audioEnabled,
    activeCall,
    items.length,
    hasPending,
    fade,
  ]);

  // Eventos do player nativo são independentes do polling do servidor. Só o
  // término/erro do decoder efetivamente avança a playlist.
  useEffect(
    () => () => {
      if (!NATIVE_SYNC_ONLY && !nativeLocalPlayback) nativeBridge()?.stopMedia?.();
    },
    [],
  );

  useEffect(() => {
    if (NATIVE_SYNC_ONLY || nativeLocalPlayback) {
      nativePlaybackReceiverRef.current = () => {};
      return;
    }
    if (!nativeMediaItemId) {
      nativePlaybackReceiverRef.current = () => {};
      return;
    }
    const receiver = (event: string, itemId: string) => {
      if (itemId !== nativeMediaItemId) return;
      if (event === "ready" || event === "progress") {
        beatRef.current = Date.now();
        mediaProgressRef.current = Date.now();
        setVideoPlayingKey(videoRenderKey);
        return;
      }
      if (event === "ended" || event === "error") {
        setVideoPlayingKey(null);
        if (event === "ended" && items.length === 1 && !hasPending) return;
        advance();
      }
    };
    nativePlaybackReceiverRef.current = receiver;
    return () => {
      if (nativePlaybackReceiverRef.current === receiver) {
        nativePlaybackReceiverRef.current = () => {};
      }
    };
  }, [nativeMediaItemId, videoRenderKey, items.length, hasPending, advance]);

  // Antecipação para o cache persistente do APK. A chave não depende da URL
  // assinada, portanto o mesmo arquivo não é baixado outra vez a cada sync.
  useEffect(() => {
    if (!canUseNativeMedia()) return;
    nativeBridge()?.preloadMedia?.(JSON.stringify(nativePreloadRef.current));
  }, [downloadKey, networkAvailable]);

  useEffect(() => {
    if (!nativeMediaActive) return;
    const previousHtml = document.documentElement.style.backgroundColor;
    const previousBody = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = "transparent";
    document.body.style.backgroundColor = "transparent";
    return () => {
      document.documentElement.style.backgroundColor = previousHtml;
      document.body.style.backgroundColor = previousBody;
    };
  }, [nativeMediaActive]);

  const flushPlaybackOutbox = useCallback(async () => {
    if (!token || playbackFlushRunningRef.current) return;
    playbackFlushRunningRef.current = true;
    try {
      // A fila do player nativo permanece no SQLite do APK ate cada POST ser
      // aceito. Nao a transferimos para localStorage: uma queda entre as duas
      // gravacoes era justamente o ponto que perdia relatorios offline.
      const nativeRaw = nativeBridge()?.drainOfflinePlaybackReports?.();
      const nativeRows = nativeRaw ? (JSON.parse(nativeRaw) as unknown) : [];
      if (Array.isArray(nativeRows)) {
        for (const nativeItem of nativeRows) {
          const valid = nativeItem as Partial<NativePlaybackOutboxItem>;
          if (
            typeof valid._nativeReportId !== "number" ||
            typeof valid.startedAt !== "string" ||
            typeof valid.durationMs !== "number"
          )
            continue;
          const response = await fetch("/api/public/player/playback", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body: JSON.stringify({
              playlistId: valid.playlistId ?? null,
              mediaAssetId: valid.mediaAssetId ?? null,
              durationMs: valid.durationMs,
              startedAt: valid.startedAt,
            }),
          });
          if (!response.ok) break;
          nativeBridge()?.acknowledgeOfflinePlaybackReportsThrough?.(valid._nativeReportId);
        }
      }
      while (playbackOutboxRef.current.length > 0) {
        const item = playbackOutboxRef.current[0];
        const response = await fetch("/api/public/player/playback", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify(item),
        });
        if (!response.ok) break;
        playbackOutboxRef.current.shift();
        persistPlaybackOutbox(playbackOutboxRef.current);
      }
    } catch {
      // Mantem os eventos no dispositivo para a proxima reconexao.
    } finally {
      playbackFlushRunningRef.current = false;
    }
  }, [token]);

  const queuePlaybackReport = useCallback(
    (item: PlayerItem, playlistId: string | null) => {
      if (!token) return;
      playbackOutboxRef.current.push({
        playlistId,
        mediaAssetId: item.mediaAssetId ?? null,
        durationMs: item.durationMs,
        // Usa a diferenca medida contra o servidor para que um relogio de TV
        // incorreto nao faca o endpoint rejeitar os relatórios de exibicao.
        startedAt: new Date(Date.now() + serverClockOffsetRef.current).toISOString(),
      });
      if (playbackOutboxRef.current.length > MAX_PLAYBACK_OUTBOX_ITEMS) {
        playbackOutboxRef.current.splice(0, playbackOutboxRef.current.length - MAX_PLAYBACK_OUTBOX_ITEMS);
      }
      persistPlaybackOutbox(playbackOutboxRef.current);
      void flushPlaybackOutbox();
    },
    [token, flushPlaybackOutbox],
  );

  useEffect(() => {
    if (!token) return;
    void flushPlaybackOutbox();
    const onOnline = () => void flushPlaybackOutbox();
    window.addEventListener("online", onOnline);
    const retry = window.setInterval(() => void flushPlaybackOutbox(), 15_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(retry);
    };
  }, [token, flushPlaybackOutbox]);

  // Registra o horario local de entrada do item e preserva a notificacao se
  // estiver offline. O servidor usa esse startedAt, em vez da hora do envio.
  useEffect(() => {
    if (NATIVE_SYNC_ONLY || nativeLocalPlayback) return;
    if (!current) return;
    queuePlaybackReport(current, sync?.playlist?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, index, sync?.playlist?.id, queuePlaybackReport]);

  // Every new item starts fully visible again.
  useEffect(() => {
    setLeaving(false);
  }, [index]);

  // A successful sync only proves that the server is reachable. It does not
  // prove that the current decoder or iframe is still advancing. Keep a
  // separate media watchdog so a frozen video cannot be kept alive forever by
  // the 60-second server sync.
  const currentKind = current?.kind;
  const currentDurationMs = current?.durationMs ?? 0;
  useEffect(() => {
    if (!linked || !currentKind || items.length === 0 || nativeMediaActive || nativeLocalPlayback) return;
    mediaProgressRef.current = Date.now();

    // Browsers normally emit timeupdate several times per second. Forty-five
    // seconds without progress is therefore a genuine stall, while still
    // allowing a slow device to recover from a short buffering pause.
    const silenceLimit =
      currentKind === "video"
        ? 45_000
        : Math.max(45_000, Math.max(1_000, currentDurationMs) + 30_000);
    const watchdog = window.setInterval(() => {
      if (Date.now() - mediaProgressRef.current <= silenceLimit) return;
      // Remount the current item (also works for a single-item playlist) or
      // move to the next one. This path intentionally does not reload the
      // whole screen, preserving the device link and local cache.
      mediaProgressRef.current = Date.now();
      advance();
    }, 15_000);
    return () => window.clearInterval(watchdog);
  }, [
    linked,
    current?.id,
    currentKind,
    currentDurationMs,
    nativeMediaActive,
    index,
    items.length,
    waitsForRemoteWidget,
    advance,
  ]);

  // Images advance on a timer; videos advance when they end. With the fade
  // transition on, the outgoing item dims during its final FADE_MS so the
  // effect happens at the end of the exhibition too, not only at the start.
  useEffect(() => {
    if (NATIVE_SYNC_ONLY || nativeLocalPlayback) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (leaveRef.current) window.clearTimeout(leaveRef.current);
    if (!current || items.length === 0) return;
    if (current.kind === "video") return;
    if (waitsForRemoteWidget) return;
    const total = Math.max(1000, current.durationMs);
    if (fade && total > FADE_MS * 2) {
      leaveRef.current = window.setTimeout(() => setLeaving(true), total - FADE_MS);
    }
    timerRef.current = window.setTimeout(() => advance(), total);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (leaveRef.current) window.clearTimeout(leaveRef.current);
    };
    // Stable identity only: a re-signed link must not restart the exhibition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    current?.id,
    current?.kind,
    current?.durationMs,
    index,
    items.length,
    advance,
    fade,
    waitsForRemoteWidget,
  ]);

  // Monitoramento remoto: o aplicativo Android devolve a captura por aqui e o
  // player apenas a entrega ao servidor.
  useEffect(() => {
    if (!token) return;
    const upload = async (image: string, contentType?: string) => {
      try {
        await fetch("/api/public/player/screenshot", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ image, contentType: contentType ?? "image/jpeg" }),
        });
      } catch {
        // Sem rede agora: a próxima captura tenta de novo.
      }
    };
    (window as unknown as { __mdi360Screenshot?: typeof upload }).__mdi360Screenshot = upload;
    return () => {
      delete (window as unknown as { __mdi360Screenshot?: typeof upload }).__mdi360Screenshot;
    };
  }, [token]);

  // Resolução forçada: o aplicativo passa a desenhar a página no tamanho exato
  // pedido e encaixa o resultado no painel físico.
  const forcedWidth = sync?.device?.screenWidth ?? null;
  const forcedHeight = sync?.device?.screenHeight ?? null;
  useEffect(() => {
    nativeBridge()?.setResolution?.(forcedWidth ?? 0, forcedHeight ?? 0);
  }, [forcedWidth, forcedHeight]);

  useEffect(() => {
    if (!linked) return;
    const interval = window.setInterval(() => {
      // When there is no playlist/item, a full reload is still useful. While
      // media is present, its dedicated watchdog above owns recovery and does
      // not get masked by background sync responses.
      if (items.length === 0 && Date.now() - beatRef.current > 120_000) {
        window.location.reload();
      }
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [linked, items.length]);

  if (!ready) return <div className="min-h-screen bg-black" />;

  if (!linked) return <ActivationScreen code={activationCode} message={error} />;

  // The call is drawn ON TOP of the playlist: nothing is unmounted, so the
  // rotation keeps its place and simply resumes when the call disappears.
  // Video audio is muted while a call is on screen.
  const callOverlay = activeCall ? (
      <QueueCallOverlay
        call={activeCall}
        accentColor={sync?.branding?.color ?? null}
        onDone={startNextCall}
      />
    ) : null;
  const showHybridIssuer =
    IS_ANDROID_HYBRID &&
    sync?.device.enabledModes?.includes("issuer") &&
    !sync?.device.enabledModes?.includes("display");

  if (!sync)
    return (
      <div className="relative min-h-screen overflow-hidden bg-black">
        <SplashScreen branding={null} message={error ?? "Conectando ao servidor…"} />
        {callOverlay}
      </div>
    );

  if (NATIVE_SYNC_ONLY) {
    return <div className="h-screen w-screen bg-transparent" aria-label="Sincronizacao local MDI 360" />;
  }

  return (
    <div
      className={`relative min-h-screen overflow-hidden ${nativeMediaActive ? "bg-transparent" : "bg-black"}`}
    >
      {sync.suspended ? (
        <div className="grid h-screen w-screen place-items-center bg-black px-6 text-center text-white">
          <div>
            <h1 className="text-4xl font-semibold">Serviço temporariamente suspenso</h1>
            <p className="mt-3 text-lg text-white/70">
              Entre em contato com o responsável pela conta MDI 360.
            </p>
          </div>
        </div>
      ) : showHybridIssuer ? (
        <iframe
          src="/emitir/dispositivo?desktop=1"
          title="Emissor de senhas"
          className="h-screen w-screen border-0"
          allow="autoplay"
        />
      ) : nativeLocalPlayback ? (
        <div className="h-screen w-screen bg-transparent" aria-label="Player local MDI 360" />
      ) : IS_ANDROID_HYBRID && !sync.device.enabledModes?.includes("display") ? (
        <div className="h-screen w-screen bg-black" aria-label="Exibição de mídias desativada" />
      ) : items.length === 0 ? (
        <SplashScreen
          branding={sync.branding}
          message={
            error ??
            (allItems.length > 0
              ? "Baixando conteúdo para esta tela…"
              : "Nenhuma playlist programada para este horário.")
          }
        />
      ) : nativeMediaActive ? (
        <div className="h-screen w-screen bg-transparent" aria-label="Vídeo nativo em reprodução" />
      ) : current?.kind === "video" ? (
        <FadeLayer enabled={fade} step={index} leaving={leaving}>
          <div className="h-screen w-screen overflow-hidden bg-black">
            <video
              key={`${current.id}-${index}-${localSrc ? "local" : "remote"}`}
              src={localSrc ?? current.url ?? undefined}
              className="h-screen w-screen object-contain"
              autoPlay
              muted={current.isMuted || sync.device?.audioEnabled === false || Boolean(activeCall)}
              playsInline
              controls={false}
              controlsList="nodownload nofullscreen noremoteplayback"
              disableRemotePlayback
              disablePictureInPicture
              poster={TRANSPARENT_VIDEO_POSTER}
              preload="auto"
              // Só revela o vídeo quando ele realmente começa a tocar: evita o
              // ícone de "Play" e qualquer interface do sistema no primeiro frame.
              // The transition wrapper handles visual swaps. Do not depend on
              // the browser firing "playing" after a background sync.
              style={{
                opacity: videoPlayingKey === videoRenderKey ? 1 : 0,
                transition: fade ? `opacity ${FADE_MS}ms ease-in-out` : undefined,
              }}
              onCanPlay={(event) => {
                void playWithBrowserFallback(event.currentTarget);
              }}
              onPlaying={() => {
                beatRef.current = Date.now();
                mediaProgressRef.current = Date.now();
                setVideoPlayingKey(videoRenderKey);
              }}
              onWaiting={() => setVideoPlayingKey(null)}
              onStalled={() => setVideoPlayingKey(null)}
              loop={items.length === 1 && !hasPending}
              onTimeUpdate={(event) => {
                beatRef.current = Date.now();
                mediaProgressRef.current = Date.now();
                if (!fade || leaving) return;
                const el = event.currentTarget;
                if (!Number.isFinite(el.duration) || el.duration <= FADE_MS / 500) return;
                if (items.length === 1 && !hasPending) return;
                if (el.duration - el.currentTime <= FADE_MS / 1000) setLeaving(true);
              }}
              onEnded={() => {
                setVideoPlayingKey(null);
                if (items.length === 1 && !hasPending) return;
                advance();
              }}
              onError={() => {
                setVideoPlayingKey(null);
                advance();
              }}
            />
          </div>
        </FadeLayer>
      ) : current?.kind === "widget" && current.widgetConfig ? (
        <FadeLayer enabled={fade} step={index} leaving={leaving} key={`${current.id}-${index}`}>
          <WidgetView
            config={current.widgetConfig}
            accentColor={sync.branding?.color ?? null}
            deviceToken={token}
            onReady={markWidgetReady}
          />
        </FadeLayer>
      ) : current?.kind === "stream" && current.url ? (
        <FadeLayer enabled={fade} step={index} leaving={leaving}>
          <StreamLayer
            key={`${current.id}-${index}`}
            url={current.url}
            name={current.name}
            muted={current.isMuted || sync.device?.audioEnabled === false || Boolean(activeCall)}
            loop={items.length === 1 && !hasPending}
          />
        </FadeLayer>
      ) : current?.kind === "web" ? (
        <FadeLayer enabled={fade} step={index} leaving={leaving}>
          <iframe
            key={`${current.id}-${index}`}
            src={current.url ?? undefined}
            title={current.name}
            className="h-screen w-screen border-0"
            sandbox="allow-scripts allow-same-origin"
          />
        </FadeLayer>
      ) : (
        <FadeLayer enabled={fade} step={index} leaving={leaving}>
          <img
            key={`${current?.id}-${index}-${localSrc ? "local" : "remote"}`}
            src={imageSrc}
            alt={current?.name ?? ""}
            className="h-screen w-screen object-contain"
            onLoad={() => {
              nativeBridge()?.startupStage?.("Conteúdos prontos");
              nativeBridge()?.startupComplete?.();
            }}
          />
        </FadeLayer>
      )}
      {callOverlay}
    </div>
  );
}

/**
 * Conteúdo ao vivo / por streaming (YouTube, lives, rádios).
 *
 * Nada é baixado: o endereço abre na hora. No YouTube usamos o player embutido
 * com todos os elementos de interface desligados e a camada de cliques
 * bloqueada, então a TV mostra só o vídeo — sem controles, título, sugestões
 * nem links. Endereços de mídia direta (HLS, MP4, MP3 de rádio) tocam na
 * própria tag <video>.
 */
function StreamLayer({
  url,
  name,
  muted,
  loop,
}: {
  url: string;
  name: string;
  muted: boolean;
  loop: boolean;
}) {
  const youtubeId = parseYoutubeId(url);

  if (youtubeId) {
    const src = buildYoutubeEmbedUrl(youtubeId, {
      muted,
      loop,
      origin: typeof window === "undefined" ? null : window.location.origin,
    });
    return (
      <div className="relative h-screen w-screen overflow-hidden bg-black">
        <iframe
          key={src}
          src={src}
          title={name}
          allow="autoplay; encrypted-media"
          // Sem interação não há hover, e o leve zoom corta qualquer borda da
          // interface do YouTube que apareça no início da reprodução.
          className="pointer-events-none absolute left-1/2 top-1/2 h-[102%] w-[102%] -translate-x-1/2 -translate-y-1/2 border-0"
        />
      </div>
    );
  }

  return (
    <video
      key={url}
      src={url}
      className="h-screen w-screen bg-black object-contain"
      autoPlay
      playsInline
      muted={muted}
      loop={loop}
      controls={false}
      controlsList="nodownload nofullscreen noremoteplayback"
      disableRemotePlayback
      disablePictureInPicture
      poster={TRANSPARENT_VIDEO_POSTER}
      // Some browsers do not fire "playing" again when a source changes
      // during a background sync, so the stream must never start invisible.
      style={{ opacity: 1 }}
      onCanPlay={(event) => {
        void playWithBrowserFallback(event.currentTarget);
      }}
    />
  );
}

/**
 * Optional soft transition (per screen). When disabled the child is rendered
 * as-is, so the cut stays instantaneous and costs nothing on weak hardware.
 */
function FadeLayer({
  enabled,
  step,
  leaving = false,
  children,
}: {
  enabled: boolean;
  step: number;
  leaving?: boolean;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setVisible(true);
      return;
    }
    setVisible(false);
    const raf = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(raf);
  }, [enabled, step]);

  if (!enabled) return <div className="h-screen w-screen">{children}</div>;

  return (
    <div
      className="h-screen w-screen"
      style={{
        opacity: visible && !leaving ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease-in-out`,
      }}
    >
      {children}
    </div>
  );
}

/** Full-screen activation code, meant to be read from across a room. */
function ActivationScreen({ code, message }: { code: string | null; message: string | null }) {
  return <ActivationScreenBody code={code} message={message} />;
}

/** Whitelabel splash: customer logo, text and accent colour. */
function SplashScreen({
  branding,
  message,
}: {
  branding: SyncResponse["branding"];
  message?: string;
}) {
  const color = branding?.color ?? "#ffffff";
  return (
    <div className="grid min-h-screen place-items-center bg-black px-8 text-center">
      <div className="space-y-6">
        {branding?.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt=""
            className="mx-auto max-h-40 max-w-[60vw] object-contain"
          />
        ) : null}
        <p className="font-display text-3xl font-semibold text-white sm:text-4xl">
          {branding?.splashText ?? branding?.name ?? "MDI 360"}
        </p>
        <div className="mx-auto h-1 w-32 rounded-full" style={{ backgroundColor: color }} />
        {message ? <p className="text-sm text-white/60">{message}</p> : null}
      </div>
    </div>
  );
}

function ActivationScreenBody({ code, message }: { code: string | null; message: string | null }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#0b1220] px-6 text-center text-white">
      <div className="w-full max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#a3e635]">MDI 360</p>
        <h1 className="mt-4 text-2xl font-semibold sm:text-3xl">Vincular terminal</h1>
        <p className="mt-2 text-sm text-white/60 sm:text-base">
          No painel MDI 360, abra <span className="font-medium text-white/80">Terminais</span> e use
          <span className="font-medium text-white/80"> Vincular terminal</span> com o código abaixo.
        </p>
        <p className="mx-auto mt-10 w-fit rounded-2xl border border-[#a3e635]/50 bg-[#111c2b] px-8 py-6 font-display text-6xl font-semibold tracking-[0.25em] text-[#a3e635] shadow-2xl sm:text-8xl">
          {code ?? "······"}
        </p>
        <p className="mt-10 text-sm text-white/40">
          {message ?? "Aguardando vínculo… esta tela conecta sozinha assim que for vinculada."}
        </p>
      </div>
    </div>
  );
}
