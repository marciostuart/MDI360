import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { WidgetView } from "@/components/widgets/widget-view";
import { QueueCallOverlay, type QueueCallPayload } from "@/components/queue/queue-call-overlay";
import { ActivationScreen as SharedActivationScreen } from "@/components/player/activation-screen";
import * as mediaCache from "@/lib/player/media-cache";
import type { PlayerItem, PlayerState } from "@/lib/player/contracts";
import { buildYoutubeEmbedUrl, parseYoutubeId } from "@/lib/media/stream-url";
import { matchesScheduleRule, type ScheduleRule } from "@/lib/schedules/rules";
import { WIDGET_TYPES, getWidgetDefinition, type WidgetConfig } from "@/lib/widgets/catalog";

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
    activationStyle?: import("@/lib/settings/activation-branding").ActivationBrandStyle;
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
  eventId?: string;
  playlistId: string | null;
  mediaAssetId: string | null;
  mediaName?: string | null;
  mediaKind?: string | null;
  playlistName?: string | null;
  durationMs: number;
  startedAt: string;
};

type CurrentPlaybackState = {
  playlistId: string | null;
  playlistName: string | null;
  mediaAssetId: string | null;
  mediaName: string | null;
  mediaKind: string | null;
  startedAt: string | null;
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
            typeof item?.startedAt === "string" &&
            typeof item?.durationMs === "number" &&
            (item?.eventId === undefined || typeof item.eventId === "string"),
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

/** The terminal transition is always a 500 ms black curtain. */
const FADE_MS = 500;

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
  const [playerState, setPlayerState] = useState<PlayerState>("UNLINKED");
  const [activationBranding, setActivationBranding] = useState<SyncResponse["branding"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [videoPlayingKey, setVideoPlayingKey] = useState<string | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const transitionFrameRef = useRef<number | null>(null);
  const transitionInProgressRef = useRef(false);
  const [transitionOpacity, setTransitionOpacity] = useState(1);
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
  const syncEtagRef = useRef<string | null>(null);
  // URLs already fully downloaded to this device. A file only enters the
  // rotation after its download finishes, so the TV never buffers on air.
  const [readyUrls, setReadyUrls] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState({ completed: 0, total: 0 });
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
  const currentPlaybackStateRef = useRef<CurrentPlaybackState | null>(null);
  const [widgetReadyKey, setWidgetReadyKey] = useState<string | null>(null);
  // Queue add-on: the call currently taking over the screen, plus the ones
  // waiting for their turn. Calls never overlap: each one owns the screen for
  // its full display time before the next enters.
  const [activeCall, setActiveCall] = useState<QueueCallPayload | null>(null);
  // Fade is the platform default. A hard cut only happens when the terminal
  // was explicitly configured with "none" in the Studio.
  const fade = sync?.device?.transitionEffect !== "none";
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
    if (data.branding) setActivationBranding(data.branding);
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

  /**
   * Ends the current item behind the black curtain. The item is advanced only
   * after the curtain is fully opaque, so the old video surface cannot paint
   * its last decoded frame over the transition.
   */
  const beginBlackTransition = useCallback(() => {
    if (!fade) {
      advance();
      return;
    }
    if (transitionInProgressRef.current) return;
    transitionInProgressRef.current = true;
    setTransitionOpacity(1);
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null;
      transitionInProgressRef.current = false;
      advance();
    }, FADE_MS);
  }, [advance, fade]);

  const scheduleBlackTransition = useCallback(
    (durationMs: number) => {
      if (!fade || !Number.isFinite(durationMs) || durationMs <= 0) return;
      if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = window.setTimeout(
        beginBlackTransition,
        Math.max(0, durationMs - FADE_MS),
      );
    },
    [beginBlackTransition, fade],
  );

  // Imagens, widgets, páginas e streams não disparam onEnded de forma
  // confiável. Eles precisam de um relógio próprio para avançar a playlist;
  // no corte direto o avanço ocorre no fim da duração, sem aguardar a
  // cortina, e no fade a cortina começa FADE_MS antes do fim.
  const scheduleTimedItem = useCallback(
    (durationMs: number) => {
      if (!Number.isFinite(durationMs) || durationMs <= 0) return;
      if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
      const delay = fade
        ? Math.max(0, durationMs - FADE_MS)
        : Math.max(1_000, durationMs);
      transitionTimerRef.current = window.setTimeout(() => {
        transitionTimerRef.current = null;
        if (fade) beginBlackTransition();
        else advance();
      }, delay);
    },
    [advance, beginBlackTransition, fade],
  );

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
      syncEtagRef.current = null;
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
    syncEtagRef.current = null;
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
          setActivationBranding(cached.branding ?? null);
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
        setPlayerState("SYNCING");
        nativeBridge()?.startupStage?.("Conectando ao servidor");
        const response = await fetch("/api/public/player/sync", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${deviceToken}`,
            ...(syncEtagRef.current ? { "if-none-match": syncEtagRef.current } : {}),
          },
          body: JSON.stringify({ appVersion: APP_VERSION, deviceClockMs: Date.now() }),
        });
        if (response.status === 401) {
          // The screen was deleted or unlinked in the Studio.
          await resetDevice();
          return;
        }
        if (response.status === 304) {
          // The derived state effect below applies the current network/cache
          // status without relying on a stale callback closure.
          return;
        }
        if (!response.ok) throw new Error(`sync ${response.status}`);
        syncEtagRef.current = response.headers.get("etag") ?? syncEtagRef.current;
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
        const playlistChanged = previous?.playlist?.revision !== data.playlist?.revision;
        const devicePlaybackChanged =
          previous?.device?.audioEnabled !== data.device?.audioEnabled;
        // Transition preference is not content: apply it immediately instead
        // of waiting for the current item boundary.
        if (!playing || (!playlistChanged && !devicePlaybackChanged)) {
          applySync(data, false);
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
        setPlayerState(syncRef.current ? "OFFLINE_PLAYING" : "SYNCING");
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

    // The push channel wakes the screen immediately after a Studio change.
    // This periodic sync is only a recovery path for process restarts, network
    // gaps, or an update handled by another server replica. It is deliberately
    // aligned with the server heartbeat instead of rebuilding the full plan
    // every few seconds on every terminal.
    const interval = window.setInterval(() => void runSync(token), 60_000);
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
              current: currentPlaybackStateRef.current,
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

  // A playlist scheduled for the current time is preferred. When the server
  // is between revisions (or offline), the fallback playlist is the actual
  // playable source and must also drive the current item/report state.
  const activePlaylist = sync?.playlist ?? sync?.offlineSchedule?.fallbackPlaylist ?? null;
  const allItems = activePlaylist?.items ?? [];
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
    let retryTimer: number | null = null;
    const urls = downloadUrlsRef.current.slice();
    setDownloadProgress({ completed: 0, total: urls.length });

    const run = async () => {
      let retryNeeded = false;
      let completed = 0;
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
          completed += 1;
          setDownloadProgress({ completed, total: urls.length });
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
          if (!retry) {
            retryNeeded = true;
            console.warn("[player] download incompleto; mantendo fora da fila:", url);
          }
        }
      }
      if (retryNeeded && !cancelled) {
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          void run();
        }, 10_000);
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [downloadKey, nativeLocalCacheRequired]);

  const playlistMedia = allItems.filter(
    (item) => (item.kind === "image" || item.kind === "video") && Boolean(item.url),
  );
  const playlistMediaReady = playlistMedia.every((item) =>
    nativeLocalCacheRequired
      ? nativeCachedKeys.has(item.mediaAssetId ?? item.id)
      : readyUrls.has(mediaCache.keyFor(item.url as string)),
  );
  // Libera a playlist inteira de uma vez. Assim um download tardio nunca
  // desloca o índice atual e reinicia o vídeo que já estava em reprodução.
  const waitingForPlaylistMedia =
    !nativeLocalPlayback &&
    !networkAvailable &&
    playlistMedia.length > 0 &&
    !playlistMediaReady;
  // Widgets, páginas e streams não têm arquivo; só os arquivos esperam o cache.
  const items = waitingForPlaylistMedia ? [] : allItems.filter((item) => {
    if (item.kind === "widget" || item.kind === "web" || item.kind === "stream") return true;
    // APK 1.3.9+: arquivos so entram na rotacao depois que o cache nativo
    // confirma o download completo. Nao existe streaming como contingencia.
    if (nativeLocalCacheRequired && (item.kind === "video" || item.kind === "image")) {
      return Boolean(item.url) && nativeCachedKeys.has(item.mediaAssetId ?? item.id);
    }
    // O APK possui um cache persistente proprio para arquivos. Nao espere a
    // Cache API do WebView (que alguns fabricantes limpam ao perder rede).
    if (canUseNativeMedia() && item.kind === "video") return Boolean(item.url);
    // No navegador, a rede ativa nunca deve bloquear a playlist enquanto o
    // Cache Storage aquece ou algum arquivo falha ao ser armazenado. O cache
    // continua sendo preenchido em segundo plano e passa a ser obrigatório
    // somente quando a tela estiver offline.
    if (networkAvailable) return Boolean(item.url);
    if (IS_ANDROID_HYBRID && item.kind === "image") {
      return (
        Boolean(item.url) &&
        (networkAvailable || readyUrls.has(mediaCache.keyFor(item.url as string)))
      );
    }
    return Boolean(item.url) && readyUrls.has(mediaCache.keyFor(item.url as string));
  });
  const current = items[index % Math.max(items.length, 1)];
  const videoRenderKey = current ? `${current.id}-${index}` : null;
  const currentWidgetConfig: WidgetConfig | null =
    current?.kind === "widget"
      ? current.widgetConfig ??
        (WIDGET_TYPES.includes(current.widgetType as (typeof WIDGET_TYPES)[number])
          ? getWidgetDefinition(current.widgetType as (typeof WIDGET_TYPES)[number]).defaultConfig
          : null)
      : null;

  // The live monitor must know what is on screen even when the historical
  // playback outbox is offline or still waiting for retry. This snapshot is
  // sent with the long-poll heartbeat and is not used to control playback.
  useEffect(() => {
    const playlist = activePlaylist;
    if (!current || !playlist) {
      // A troca de item pode produzir um render intermediário sem `current`.
      // Não publique esse intervalo vazio: o heartbeat não deve apagar do
      // Studio o último item confirmado antes do primeiro frame seguinte.
      return;
    }
    const currentState: CurrentPlaybackState = {
      playlistId: playlist.id,
      playlistName: playlist.name,
      mediaAssetId: current.mediaAssetId,
      mediaName: current.name,
      mediaKind: current.kind,
      startedAt: new Date(Date.now() + serverClockOffsetRef.current).toISOString(),
    };
    // Store and publish in the same committed effect. This removes the first
    // frame race where the long-poll could run before the monitor received the
    // new item.
    currentPlaybackStateRef.current = currentState;
    if (token) {
      void fetch("/api/public/player/presence", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(currentState),
      }).catch(() => {
        // The heartbeat and playback outbox remain the retry path.
      });
    }
  }, [
    token,
    current?.id,
    current?.kind,
    current?.mediaAssetId,
    index,
    sync?.offlineSchedule?.fallbackPlaylist?.id,
    sync?.playlist?.id,
    activePlaylist?.id,
  ]);
  const nativeMediaActive =
    canUseNativeMedia() &&
    nativeLocalCacheRequired &&
    (current?.kind === "video" || current?.kind === "image") &&
    Boolean(current?.url);
  const waitsForRemoteWidget =
    current?.kind === "widget" &&
    (currentWidgetConfig?.type === "lottery" || currentWidgetConfig?.type === "news") &&
    widgetReadyKey !== videoRenderKey;

  // The black curtain is the only transition surface. Content is never
  // cross-faded and the next item is mounted underneath the opaque curtain.
  useEffect(() => {
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
    if (transitionFrameRef.current !== null) window.cancelAnimationFrame(transitionFrameRef.current);
    transitionTimerRef.current = null;
    transitionInProgressRef.current = false;

    if (!fade || !current || items.length === 0 || nativeMediaActive || nativeLocalPlayback) {
      setTransitionOpacity(0);
      return;
    }

    setTransitionOpacity(1);
    transitionFrameRef.current = window.requestAnimationFrame(() => {
      transitionFrameRef.current = null;
      setTransitionOpacity(0);
    });

    // A single looping item has no boundary. A widget is scheduled only after
    // its data/image readiness gate is released, but it still fades in while
    // loading so the screen never looks like a frozen black panel.
    if (waitsForRemoteWidget || (items.length === 1 && !hasPending)) return;
    if (current.kind === "video") {
      scheduleBlackTransition(Math.max(1_000, current.durationMs));
    } else {
      scheduleTimedItem(Math.max(1_000, current.durationMs));
    }

    return () => {
      if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
      if (transitionFrameRef.current !== null) window.cancelAnimationFrame(transitionFrameRef.current);
      transitionTimerRef.current = null;
      transitionFrameRef.current = null;
    };
  }, [
    current?.durationMs,
    current?.id,
    fade,
    hasPending,
    index,
    items.length,
    nativeLocalPlayback,
    nativeMediaActive,
    scheduleBlackTransition,
    scheduleTimedItem,
    waitsForRemoteWidget,
  ]);

  useEffect(() => {
    if (!linked) {
      setPlayerState("UNLINKED");
      return;
    }
    if (waitingForPlaylistMedia) {
      setPlayerState("DOWNLOADING");
      return;
    }
    if (hasPending) {
      setPlayerState("WAITING_FOR_UPDATE");
      return;
    }
    if (current) setPlayerState(networkAvailable ? "PLAYING" : "OFFLINE_PLAYING");
    else setPlayerState("READY");
  }, [linked, waitingForPlaylistMedia, hasPending, current?.id, networkAvailable]);
  useEffect(() => {
    // Native video closes the startup layer only after ExoPlayer emits ready.
    // Other kinds are ready as soon as React can place their surface.
    if (items.length === 0 || current?.kind === "video" || current?.kind === "image") return;
    nativeBridge()?.startupStage?.("Conteúdos prontos");
    nativeBridge()?.startupComplete?.();
  }, [items.length, current?.kind]);
  // Identity that survives a re-sign of the media link, used for React keys and
  // effect dependencies so the file on screen is never remounted mid-playback.
  const currentKey = current?.url
    ? `${sync?.playlist?.id ?? ""}:${sync?.playlist?.revision ?? 0}:${mediaCache.keyFor(current.url)}`
    : null;
  // Once offline, never point an image at the remote signed link. localSrc is
  // created from Cache Storage and keeps the visible playlist independent of
  // the server connection.
  const imageSrc = localSrc ?? (networkAvailable ? current?.url ?? undefined : undefined);
  const nativeMediaItemId = nativeMediaActive && videoRenderKey ? `native:${videoRenderKey}` : null;
  const nativeMediaCacheKey = current?.mediaAssetId ?? current?.id ?? "";
  const markWidgetReady = useCallback(() => {
    if (videoRenderKey) setWidgetReadyKey(videoRenderKey);
    nativeBridge()?.startupStage?.("Conteúdos prontos");
    nativeBridge()?.startupComplete?.();
  }, [videoRenderKey]);

  // The playlist clock must not consume the lottery cycle while the first
  // payload is still loading. A bounded fallback prevents a provider outage
  // from holding the whole playlist forever.
  useEffect(() => {
    if (current?.kind !== "widget") return;
    if (currentWidgetConfig?.type !== "lottery" && currentWidgetConfig?.type !== "news") {
      // Clock, weather and currency do not need a remote readiness gate.
      if (videoRenderKey) setWidgetReadyKey(videoRenderKey);
      return;
    }
    const fallback = window.setTimeout(() => {
      if (videoRenderKey) setWidgetReadyKey(videoRenderKey);
    }, 20_000);
    return () => window.clearTimeout(fallback);
  }, [current?.kind, currentWidgetConfig?.type, videoRenderKey]);

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
    // Cache Storage is the offline layer. When the network is healthy, keep
    // the media on the browser's streaming path instead of reading the whole
    // cached video into a Blob/Object URL. That duplicated large videos in
    // RAM and eventually crashed Chrome with "Out of Memory" after a few
    // playlist rotations.
    if (networkAvailable) return;
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
        const validRows = nativeRows
          .map((nativeItem) => nativeItem as Partial<NativePlaybackOutboxItem>)
          .filter(
            (item): item is NativePlaybackOutboxItem =>
              typeof item._nativeReportId === "number" &&
              typeof item.startedAt === "string" &&
              typeof item.durationMs === "number",
          )
          .slice(0, 100);
        if (validRows.length > 0) {
          const response = await fetch("/api/public/player/playback", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body: JSON.stringify({
              events: validRows.map((item) => ({
                playlistId: item.playlistId ?? null,
                mediaAssetId: item.mediaAssetId ?? null,
                durationMs: item.durationMs,
                startedAt: item.startedAt,
              })),
            }),
          });
          if (response.ok) {
            nativeBridge()?.acknowledgeOfflinePlaybackReportsThrough?.(
              validRows[validRows.length - 1]._nativeReportId,
            );
          }
        }
      }
      while (playbackOutboxRef.current.length > 0) {
        const batch = playbackOutboxRef.current.slice(0, 100);
        const response = await fetch("/api/public/player/playback", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ events: batch }),
        });
        if (!response.ok) break;
        const result = (await response.json().catch(() => null)) as
          | { accepted?: number; acceptedEventIds?: string[] }
          | null;
        const acceptedIds = new Set(
          Array.isArray(result?.acceptedEventIds) ? result.acceptedEventIds : [],
        );
        if (acceptedIds.size > 0 && batch.some((item) => item.eventId)) {
          playbackOutboxRef.current = playbackOutboxRef.current.filter(
            (item, position) =>
              position >= batch.length || !item.eventId || !acceptedIds.has(item.eventId),
          );
        } else if (
          typeof result?.accepted !== "number" ||
          result.accepted >= batch.length
        ) {
          playbackOutboxRef.current.splice(0, batch.length);
        } else {
          // Partial legacy batches have no per-event identity. Keep them for a
          // retry instead of silently losing the report.
          break;
        }
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
        eventId:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : undefined,
        playlistId,
        mediaAssetId: item.mediaAssetId ?? null,
        mediaName: item.name ?? null,
        mediaKind: item.kind,
        playlistName:
          syncRef.current?.playlist?.name ??
          syncRef.current?.offlineSchedule?.fallbackPlaylist?.name ??
          null,
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
    queuePlaybackReport(
      current,
      sync?.playlist?.id ?? sync?.offlineSchedule?.fallbackPlaylist?.id ?? null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    current?.id,
    index,
    sync?.playlist?.id,
    sync?.offlineSchedule?.fallbackPlaylist?.id,
    queuePlaybackReport,
  ]);

  // Widgets can finish loading their remote data after they are mounted. The
  // initial event must not be the only proof-of-play record: report the same
  // item again at the moment the widget becomes renderable, so Studio knows
  // exactly what is on screen instead of showing an empty initial event.
  useEffect(() => {
    if (NATIVE_SYNC_ONLY || nativeLocalPlayback) return;
    if (current?.kind !== "widget" || widgetReadyKey !== videoRenderKey) return;
    queuePlaybackReport(
      current,
      sync?.playlist?.id ?? sync?.offlineSchedule?.fallbackPlaylist?.id ?? null,
    );
  }, [
    current?.id,
    queuePlaybackReport,
    sync?.offlineSchedule?.fallbackPlaylist?.id,
    sync?.playlist?.id,
    videoRenderKey,
    widgetReadyKey,
  ]);

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

  if (!linked) return <ActivationScreen code={activationCode} message={error} branding={activationBranding ?? sync?.branding} />;

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
      data-player-state={playerState}
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
          loadingProgress={
            allItems.length > 0 && downloadProgress.total > 0
              ? downloadProgress
              : undefined
          }
        />
      ) : nativeMediaActive ? (
        <div className="h-screen w-screen bg-transparent" aria-label="Vídeo nativo em reprodução" />
      ) : current?.kind === "video" ? (
          <div className="h-screen w-screen overflow-hidden bg-black">
            <video
              key={`${sync.playlist?.id ?? ""}:${sync.playlist?.revision ?? 0}:${current.id}:${localSrc ? "local" : "remote"}`}
              src={localSrc ?? current.url ?? undefined}
              className="h-screen w-screen border-0 object-contain outline-none ring-0"
              tabIndex={-1}
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
              style={{
                opacity: videoPlayingKey === videoRenderKey ? 1 : 0,
              }}
              onCanPlay={(event) => {
                void playWithBrowserFallback(event.currentTarget);
                // canplay is the first reliable point at which the decoder
                // has a frame available. Waiting for playing made a playlist
                // change look like a black screen on slower browsers.
                setVideoPlayingKey(videoRenderKey);
              }}
              onLoadedMetadata={(event) => {
                if (Number.isFinite(event.currentTarget.duration)) {
                  scheduleBlackTransition(event.currentTarget.duration * 1000);
                }
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
              }}
              onEnded={() => {
                setVideoPlayingKey(null);
                if (items.length === 1 && !hasPending) return;
                beginBlackTransition();
              }}
              onError={() => {
                setVideoPlayingKey(null);
                beginBlackTransition();
              }}
            />
          </div>
      ) : current?.kind === "widget" && currentWidgetConfig ? (
          <WidgetView
            key={`${current.id}-${index}`}
            config={currentWidgetConfig}
            accentColor={sync.branding?.color ?? null}
            deviceToken={token}
            // The playlist FadeLayer owns transitions between widgets/media.
            // Lottery results inside one widget change by hard cut, avoiding a
            // second cross-fade nested inside the playlist transition system.
            transitionEffect="none"
            onReady={markWidgetReady}
          />
      ) : current?.kind === "stream" && current.url ? (
          <StreamLayer
            key={`${current.id}-${index}`}
            url={current.url}
            name={current.name}
            muted={current.isMuted || sync.device?.audioEnabled === false || Boolean(activeCall)}
            loop={items.length === 1 && !hasPending}
          />
      ) : current?.kind === "web" ? (
          <iframe
            key={`${current.id}-${index}`}
            src={current.url ?? undefined}
            title={current.name}
            className="h-screen w-screen border-0"
            sandbox="allow-scripts allow-same-origin"
          />
      ) : (
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
      )}
      {callOverlay}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[9999] bg-black"
        style={{
          opacity: fade ? transitionOpacity : 0,
          transition: fade ? `opacity ${FADE_MS}ms linear` : "none",
        }}
      />
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
            className="pointer-events-none absolute left-1/2 top-1/2 h-[102%] w-[102%] -translate-x-1/2 -translate-y-1/2 border-0 outline-none ring-0"
            tabIndex={-1}
        />
      </div>
    );
  }

  return (
    <video
      key={url}
      src={url}
      className="h-screen w-screen border-0 bg-black object-contain outline-none ring-0"
      tabIndex={-1}
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

/** Full-screen activation code, meant to be read from across a room. */
function ActivationScreen({
  code,
  message,
  branding,
}: {
  code: string | null;
  message: string | null;
  branding?: SyncResponse["branding"];
}) {
  return <SharedActivationScreen code={code} message={message} branding={branding} />;
}

/** Whitelabel splash: customer logo, text and accent colour. */
function SplashScreen({
  branding,
  message,
  loadingProgress,
}: {
  branding: SyncResponse["branding"];
  message?: string;
  loadingProgress?: { completed: number; total: number };
}) {
  const color = branding?.color ?? "#ffffff";
  const progress = loadingProgress
    ? Math.min(100, Math.round((loadingProgress.completed / Math.max(1, loadingProgress.total)) * 100))
    : null;
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
        {progress !== null ? (
          <div className="mx-auto w-72 max-w-[75vw] space-y-2 text-left">
            <div className="flex justify-between text-xs text-white/60">
              <span>Preparando conteúdos</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${progress}%`, backgroundColor: color }}
              />
            </div>
            <p className="text-center text-xs text-white/45">
              {loadingProgress.completed} de {loadingProgress.total} arquivos prontos
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

