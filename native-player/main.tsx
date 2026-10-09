import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { WidgetView } from "@/components/widgets/widget-view";
import { LocalWidgetData } from "@/components/widgets/local-widget-data";
import { QueueCallOverlay, type QueueCallPayload } from "@/components/queue/queue-call-overlay";
import type { WidgetConfig } from "@/lib/widgets/catalog";
import { buildYoutubeEmbedUrl, parseYoutubeId } from "@/lib/media/stream-url";
import "@/styles.css";

type Frame = {
  playbackId: string;
  item: { kind: string; name: string; url?: string; isMuted?: boolean; widgetConfig?: WidgetConfig; widgetData?: unknown };
  accentColor?: string;
  fade?: boolean;
  issuer?: boolean;
  suspended?: boolean;
  audioEnabled?: boolean;
};
type Bridge = {
  localFrame(): string;
  visualReady(id: string): void;
  widgetUnavailable(id: string): void;
  setCallAudio(active: boolean): void;
  rendererReady(): void;
  clockNow(): number;
};
declare global {
  interface Window {
    MDI360Native: Bridge;
    __mdi360LocalFrame?: (frame: Frame) => void;
    __mdi360QueueCalls?: (calls: QueueCallPayload[]) => void;
  }
}

export function LocalScreen() {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [widgetFrames, setWidgetFrames] = useState<Frame[]>([]);
  const [calls, setCalls] = useState<QueueCallPayload[]>([]);
  const currentFrame = useRef<Frame | null>(null);
  const call = calls[0];
  const promotePreparedWidget = useCallback((playbackId: string) => {
    setWidgetFrames((current) => {
      const incoming = current.at(-1);
      return incoming?.playbackId === playbackId ? [incoming] : current;
    });
  }, []);
  useEffect(() => {
    const seen = new Set<string>();
    window.__mdi360LocalFrame = (next) => {
      if (next.item.kind === "widget" && next.item.widgetConfig) {
        setWidgetFrames((current) =>
          current.some((entry) => entry.playbackId === next.playbackId) ? current : [...current, next],
        );
      } else {
        setWidgetFrames([]);
      }
      currentFrame.current = next;
      setFrame(next);
    };
    window.__mdi360QueueCalls = (incoming) => {
      const fresh = incoming.filter((item) => !seen.has(item.id));
      fresh.forEach((item) => seen.add(item.id));
      // Bound only the deduplication set, never the pending call queue.
      if (seen.size > 2000) [...seen].slice(0, 1000).forEach((id) => seen.delete(id));
      setCalls((previous) => [...previous, ...fresh]);
    };
    window.MDI360Native.rendererReady();
    return () => { delete window.__mdi360LocalFrame; delete window.__mdi360QueueCalls; };
  }, []);
  const callActive = Boolean(call);
  useEffect(() => {
    window.MDI360Native.setCallAudio(callActive);
    return () => window.MDI360Native.setCallAudio(false);
  }, [callActive]);
  useEffect(() => {
    if (!frame) return;
    if (frame.item.kind === "stream") return;
    if (frame.item.kind === "widget") return;
    if (frame.item.widgetConfig?.type === "news" || frame.item.widgetConfig?.type === "lottery") return;
    // Widget data and images are already on disk. Allow React to paint before
    // reporting the visual start; no server response governs this timer.
    let reported = false;
    const ready = () => {
      if (reported) return;
      reported = true;
      window.MDI360Native.visualReady(frame.playbackId);
    };
    const id = window.requestAnimationFrame(ready);
    // Some TV WebViews delay animation frames; never wait indefinitely after
    // a fully local widget has committed its layout.
    const timeout = window.setTimeout(ready, 250);
    return () => { window.cancelAnimationFrame(id); window.clearTimeout(timeout); };
  }, [frame]);
  const item = frame?.item;
  return (
    <div className="relative h-screen w-screen overflow-hidden" style={{ background: "transparent" }}>
      {frame?.suspended ? <div className="grid size-full place-items-center bg-black text-3xl text-white">Serviço temporariamente suspenso</div>
        : frame?.issuer ? <iframe title="Emissor de senhas" src="/emitir/dispositivo?desktop=1" className="size-full border-0" allow="autoplay" />
        : item?.kind === "widget" && item.widgetConfig ? (
          widgetFrames.map((widget, index) => (
            <div key={widget.playbackId} className="absolute inset-0" style={{ zIndex: index }}>
              <ReadyWidget frame={widget} onPrepared={promotePreparedWidget} />
            </div>
          ))
        ) : item?.kind === "stream" && item.url ? (
          <LocalStream url={item.url} name={item.name} muted={item.isMuted !== false || frame?.audioEnabled === false || callActive}
            onReady={() => window.MDI360Native.visualReady(frame!.playbackId)} />
        ) : item?.kind === "web" ? (
          <iframe key={frame?.playbackId} title={item.name} src={item.url} className="size-full border-0" allow="autoplay" sandbox="allow-scripts allow-same-origin" />
        ) : frame && !item?.kind ? (
          <div className="grid size-full place-items-center bg-black text-xl text-white/70">Nenhum conteúdo local disponível para este horário.</div>
        ) : null}
      {call ? <QueueCallOverlay call={call} onDone={() => setCalls((previous) => previous.slice(1))} /> : null}
    </div>
  );
}

/** Decode prepared local images before mounting any news/weather layout. */
function ReadyWidget({ frame, onPrepared }: { frame: Frame; onPrepared?: (playbackId: string) => void }) {
  const [ready, setReady] = useState(false);
  const config = frame.item.widgetConfig!;
  // The Android WebView/TV Box compositor drops frames on large Ken Burns
  // layers. Keep the effect available in the web player, but disable only this
  // animation in the local Android renderer so widgets remain fluid and stable.
  const playerConfig = useMemo(() => {
    if (!config.theme?.kenBurns) return config;
    return { ...config, theme: { ...config.theme, kenBurns: false } } as WidgetConfig;
  }, [config]);
  useEffect(() => {
    let cancelled = false;
    const images: HTMLImageElement[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const data = frame.item.widgetData as { items?: { title?: string; image?: string | null }[]; current?: { temperature?: number | null; code?: number | null }; quotes?: unknown[]; results?: unknown[] } | undefined;
    const urls = new Set<string>();
    if (config.theme?.background === "image" && config.theme.backgroundImageUrl) urls.add(config.theme.backgroundImageUrl);
    if (config.type === "news") data?.items?.forEach((article) => { if (article.image) urls.add(article.image); });
    const valid = config.type === "clock" || (config.type === "news" ? Boolean(data?.items?.length && data.items.every((article) => article.title?.trim()))
      : config.type === "weather" ? data?.current?.temperature != null && data.current.code != null
        : config.type === "currency" ? Boolean(data?.quotes?.length) : Boolean(data?.results?.length));
    const tasks = [...urls].map((url) => new Promise<void>((resolve, reject) => {
      const image = new Image();
      images.push(image);
      const timeout = setTimeout(() => reject(new Error("Local image unavailable")), 5000);
      timers.push(timeout);
      image.onerror = () => { clearTimeout(timeout); reject(new Error("Local image invalid")); };
      image.onload = () => {
        void (image.decode ? image.decode() : Promise.resolve()).then(() => {
          clearTimeout(timeout); resolve();
        }, () => { clearTimeout(timeout); reject(new Error("Local image decode failed")); });
      };
      image.src = url;
    }));
    if (!valid) tasks.push(Promise.reject(new Error("Widget incomplete")));
    void Promise.all(tasks).then(() => { if (!cancelled) setReady(true); }, () => {
      if (!cancelled) window.MDI360Native.widgetUnavailable(frame.playbackId);
    });
    return () => { cancelled = true; timers.forEach(clearTimeout); images.forEach((image) => { image.onload = null; image.onerror = null; }); };
  }, [frame, config]);
  useEffect(() => {
    if (ready) onPrepared?.(frame.playbackId);
  }, [ready, frame.playbackId, onPrepared]);
  useEffect(() => {
    if (!ready || config.type === "news" || config.type === "lottery") return;
    const timer = setTimeout(() => window.MDI360Native.visualReady(frame.playbackId), 100);
    return () => clearTimeout(timer);
  }, [ready, config.type, frame.playbackId]);
  if (!ready) return null;
  return <LocalWidgetData.Provider value={{ payload: frame.item.widgetData ?? null, now: () => window.MDI360Native.clockNow(), imagesReady: true }}>
            <WidgetView config={playerConfig} accentColor={frame.accentColor} transitionEffect={frame.fade ? "fade" : "none"} onReady={() => window.MDI360Native.visualReady(frame.playbackId)} />
  </LocalWidgetData.Provider>;
}
function LocalStream({ url, name, muted, onReady }: { url: string; name: string; muted: boolean; onReady: () => void }) {
  const youtube = parseYoutubeId(url);
  if (youtube) return <iframe title={name} src={buildYoutubeEmbedUrl(youtube, { muted, loop: true, origin: window.location.origin })}
     className="pointer-events-none size-full border-0 outline-none ring-0" tabIndex={-1} allow="autoplay; encrypted-media" onLoad={onReady} />;
  return <video src={url} autoPlay playsInline muted={muted} controls={false}
    poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
     className="size-full border-0 bg-black object-contain outline-none ring-0" tabIndex={-1} onPlaying={onReady}
    onCanPlay={(event) => { void event.currentTarget.play().catch(() => undefined); }} />;
}
createRoot(document.getElementById("root")!).render(<LocalScreen />);
