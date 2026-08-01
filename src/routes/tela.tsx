import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { WidgetView } from "@/components/widgets/widget-view";
import { QueueCallOverlay, type QueueCallPayload } from "@/components/queue/queue-call-overlay";
import * as mediaCache from "@/lib/player/media-cache";
import { buildYoutubeEmbedUrl, parseYoutubeId } from "@/lib/media/stream-url";
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
  device: {
    id: string;
    name: string;
    canvasPreset: string;
    audioEnabled?: boolean;
    /** "fade" faz um crossfade suave entre arquivos; "none" corta seco. */
    transitionEffect?: string;
  };
  playlist: { id: string; name: string; revision: number; items: PlayerItem[] } | null;
  branding: {
    name: string | null;
    splashText: string | null;
    color: string | null;
    logoUrl: string | null;
  } | null;
  commands: string[];
  syncIntervalMs: number;
  revision?: number;
  /** Add-on de senhas: chamada mais recente desta tela (null quando inativo). */
  queueCall?: QueueCallPayload | null;
  queueCalls?: QueueCallPayload[] | null;
};

const TOKEN_KEY = "mdi360.deviceToken";
const CODE_KEY = "mdi360.activationCode";
const APP_VERSION = "web-1.0.0";

/**
 * Wipes everything this screen cached locally. Runs when the customer deletes
 * the screen in the Studio, so the device never keeps showing stale content.
 */
async function wipeLocalCache() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(CODE_KEY);
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
  const timerRef = useRef<number | null>(null);
  /** Ultimo sinal de vida do player, usado pelo watchdog. */
  const beatRef = useRef<number>(Date.now());
  const revisionRef = useRef(0);
  // Sync data that arrived while a file was on screen. It is only applied on
  // the next item boundary so nothing is ever cut mid-exhibition.
  const pendingSyncRef = useRef<SyncResponse | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const syncRef = useRef<SyncResponse | null>(null);
  // URLs already fully downloaded to this device. A file only enters the
  // rotation after its download finishes, so the TV never buffers on air.
  const [readyUrls, setReadyUrls] = useState<Set<string>>(new Set());
  const [localSrc, setLocalSrc] = useState<string | null>(null);
  const leaveRef = useRef<number | null>(null);
  /** True during the last FADE_MS of an item, so it fades out before swapping. */
  const [leaving, setLeaving] = useState(false);
  // Queue add-on: the call currently taking over the screen, plus the ones
  // waiting for their turn. Calls never overlap: each one owns the screen for
  // its full display time before the next enters.
  const [activeCall, setActiveCall] = useState<QueueCallPayload | null>(null);
  const fade = sync?.device?.transitionEffect === "fade";
  const activeCallRef = useRef<QueueCallPayload | null>(null);
  const waitingCallsRef = useRef<QueueCallPayload[]>([]);
  const seenCallIdsRef = useRef<Set<string>>(new Set());

  /** Shows the next waiting call, or releases the screen back to the playlist. */
  const startNextCall = useCallback(() => {
    const next = waitingCallsRef.current.shift() ?? null;
    activeCallRef.current = next;
    setActiveCall(next);
  }, []);

  /** Adds freshly arrived calls to the queue without disturbing the current one. */
  const enqueueCalls = useCallback(
    (calls: QueueCallPayload[]) => {
      let added = false;
      for (const call of calls) {
        if (!call?.id || seenCallIdsRef.current.has(call.id)) continue;
        seenCallIdsRef.current.add(call.id);
        waitingCallsRef.current.push(call);
        added = true;
      }
      if (added && !activeCallRef.current) startNextCall();
    },
    [startNextCall],
  );

  const applySync = useCallback((data: SyncResponse, resetIndex: boolean) => {
    pendingSyncRef.current = null;
    setHasPending(false);
    syncRef.current = data;
    setSync(data);
    if (resetIndex) setIndex(0);
  }, []);

  /**
   * Moves to the next item. If a newer playlist/settings payload is waiting,
   * this is the moment it takes effect.
   */
  const advance = useCallback(() => {
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
    const stored = window.localStorage.getItem(TOKEN_KEY);
    setToken(stored);
    setActivationCode(window.localStorage.getItem(CODE_KEY));
    setReady(true);
    if (!stored) void register();
  }, [register]);

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
        const response = await fetch("/api/public/player/sync", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${deviceToken}`,
          },
          body: JSON.stringify({ appVersion: APP_VERSION }),
        });
        if (response.status === 401) {
          // The screen was deleted or unlinked in the Studio.
          await resetDevice();
          return;
        }
        if (!response.ok) throw new Error(`sync ${response.status}`);
        const data = (await response.json()) as SyncResponse;
        if (typeof data.revision === "number") revisionRef.current = data.revision;

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
          // Hold it back: the current file finishes first.
          pendingSyncRef.current = data;
          setHasPending(true);
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
    [resetDevice, applySync, enqueueCalls],
  );

  useEffect(() => {
    if (!token || !linked) return;
    void runSync(token);

    // Safety net: even if the push channel dies, the screen refreshes itself.
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
            body: JSON.stringify({ revision: revisionRef.current }),
          });
          if (stopped) return;
          if (response.status === 401) {
            await resetDevice();
            return;
          }
          if (!response.ok) throw new Error("events");
          const data = (await response.json()) as { revision: number; changed: boolean };
          revisionRef.current = data.revision;
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
  const downloadUrls = allItems
    .filter((item) => (item.kind === "image" || item.kind === "video") && item.url)
    .map((item) => item.url as string);
  // Depend on the stable storage paths, never on the signed links: those change
  // on every sync and would restart the downloads (and the video) each minute.
  const downloadKey = downloadUrls.map((url) => mediaCache.keyFor(url)).join("|");
  const downloadUrlsRef = useRef<string[]>(downloadUrls);
  downloadUrlsRef.current = downloadUrls;

  // Downloads missing files in the background and removes from the local cache
  // anything that is no longer in the playlist (e.g. deleted in the Studio).
  useEffect(() => {
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
  }, [downloadKey]);

  // Widgets, páginas e streams não têm arquivo; só os arquivos esperam o cache.
  const items = allItems.filter((item) => {
    if (item.kind === "widget" || item.kind === "web" || item.kind === "stream") return true;
    return Boolean(item.url) && readyUrls.has(mediaCache.keyFor(item.url as string));
  });
  const current = items[index % Math.max(items.length, 1)];
  // Identity that survives a re-sign of the media link, used for React keys and
  // effect dependencies so the file on screen is never remounted mid-playback.
  const currentKey = current?.url ? mediaCache.keyFor(current.url) : null;

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

  // Playback reporting: one row per item that actually went on screen, which
  // feeds the customer's exhibition reports and the live "no ar agora" view.
  useEffect(() => {
    if (!token || !current) return;
    const controller = new AbortController();
    void fetch("/api/public/player/playback", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        playlistId: sync?.playlist?.id ?? null,
        mediaAssetId: current.mediaAssetId ?? null,
        durationMs: current.durationMs,
      }),
      signal: controller.signal,
    }).catch(() => undefined);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, current?.id, index, sync?.playlist?.id]);

  // Every new item starts fully visible again.
  useEffect(() => {
    setLeaving(false);
  }, [index]);

  // Images advance on a timer; videos advance when they end. With the fade
  // transition on, the outgoing item dims during its final FADE_MS so the
  // effect happens at the end of the exhibition too, not only at the start.
  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (leaveRef.current) window.clearTimeout(leaveRef.current);
    if (!current || items.length === 0) return;
    if (current.kind === "video") return;
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
  }, [current?.id, current?.kind, current?.durationMs, index, items.length, advance, fade]);

  // Watchdog: qualquer sinal de vida (item trocou, chamada exibida, servidor
  // respondeu) renova o relogio. Se nada acontecer por 2 minutos, a tela se
  // recarrega sozinha em vez de ficar congelada.
  useEffect(() => {
    beatRef.current = Date.now();
  }, [index, current, sync, activeCall, linked]);

  useEffect(() => {
    if (!linked) return;
    const interval = window.setInterval(() => {
      if (Date.now() - beatRef.current > 120_000) window.location.reload();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [linked]);

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

  if (!sync)
    return (
      <div className="relative min-h-screen overflow-hidden bg-black">
        <SplashScreen branding={null} message={error ?? "Conectando ao servidor…"} />
        {callOverlay}
      </div>
    );

  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      {items.length === 0 ? (
        <SplashScreen
          branding={sync.branding}
          message={
            error ??
            (allItems.length > 0
              ? "Baixando conteúdo para esta tela…"
              : "Nenhuma playlist programada para este horário.")
          }
        />
      ) : current?.kind === "video" ? (
        <FadeLayer enabled={fade} step={index} leaving={leaving}>
          <video
            key={`${current.id}-${index}-${localSrc ? "local" : "remote"}`}
            src={localSrc ?? current.url ?? undefined}
            className="h-screen w-screen object-contain"
            autoPlay
            muted={current.isMuted || sync.device?.audioEnabled === false || Boolean(activeCall)}
            playsInline
            loop={items.length === 1 && !hasPending}
            onTimeUpdate={(event) => {
              if (!fade || leaving) return;
              const el = event.currentTarget;
              if (!Number.isFinite(el.duration) || el.duration <= FADE_MS / 500) return;
              if (items.length === 1 && !hasPending) return;
              if (el.duration - el.currentTime <= FADE_MS / 1000) setLeaving(true);
            }}
            onEnded={() => {
              if (items.length === 1 && !hasPending) return;
              advance();
            }}
            onError={() => advance()}
          />
        </FadeLayer>
      ) : current?.kind === "widget" && current.widgetConfig ? (
        <FadeLayer enabled={fade} step={index} leaving={leaving} key={`${current.id}-${index}`}>
          <WidgetView config={current.widgetConfig} accentColor={sync.branding?.color ?? null} />
        </FadeLayer>
      ) : current?.kind === "stream" && current.url ? (
        <FadeLayer enabled={fade} step={index} leaving={leaving}>
          <StreamLayer
            key={`${current.id}-${index}`}
            url={current.url}
            name={current.name}
            muted={
              current.isMuted || sync.device?.audioEnabled === false || Boolean(activeCall)
            }
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
            src={localSrc ?? current?.url ?? undefined}
            alt={current?.name ?? ""}
            className="h-screen w-screen object-contain"
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
    <div className="grid min-h-screen place-items-center bg-black px-6 text-center text-white">
      <div className="w-full max-w-2xl">
        <p className="text-sm uppercase tracking-[0.4em] text-white/50">MDI 360</p>
        <h1 className="mt-4 text-2xl font-semibold sm:text-3xl">Código de ativação</h1>
        <p className="mt-2 text-sm text-white/60 sm:text-base">
          No painel MDI 360, abra <span className="font-medium text-white/80">Telas</span> e use
          <span className="font-medium text-white/80"> Vincular tela</span> com o código abaixo.
        </p>
        <p className="mt-10 font-display text-6xl font-semibold tracking-[0.25em] sm:text-8xl">
          {code ?? "······"}
        </p>
        <p className="mt-10 text-sm text-white/40">
          {message ?? "Aguardando vínculo… esta tela conecta sozinha assim que for vinculada."}
        </p>
      </div>
    </div>
  );
}
