import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Maximize } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { QueueButtonContent } from "@/components/queue/queue-button-content";
import { queueButtonStyle } from "@/components/queue/queue-button-style";
import { Card, CardContent } from "@/components/ui/card";
import { getKioskPanel, issueKioskTicket, type KioskPanel } from "@/lib/queue/kiosk.functions";
import { queueLayoutOverlayCss, type QueueLayoutBlock } from "@/lib/queue/queue-layout";

// Ponte opcional com o aplicativo desktop (MDI360 Emissor) para impressão térmica automática.
type DesktopBridge = {
  isDesktop?: boolean;
  isPrinterConnected?: () => Promise<boolean>;
};

function desktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { mdiEmitter?: DesktopBridge }).mdiEmitter ?? null;
}

export const Route = createFileRoute("/emitir/$token")({
  head: ({ params }) => ({
    meta: [
      { title: "Retire sua senha · MDI 360" },
      {
        name: "description",
        content:
          "Tela de emissão de senhas do MDI 360: retire sua senha normal ou preferencial em segundos.",
      },
      { property: "og:title", content: "Retire sua senha · MDI 360" },
      {
        property: "og:description",
        content: "Emissão de senhas normais e preferenciais para atendimento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
      // PWA: permite instalar o emissor como aplicativo em tela cheia.
      { name: "theme-color", content: "#0b1220" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Senhas" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      {
        rel: "manifest",
        href: `/api/public/emissor-manifest?token=${encodeURIComponent(params.token)}`,
      },
      { rel: "apple-touch-icon", href: "/emissor-icon.png" },
    ],
  }),
  component: KioskPage,
});

/** Trava a página: sem rolagem, sem "puxar para atualizar", ocupando a tela toda. */
function useKioskViewport() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previous = { html: html.getAttribute("style"), body: body.getAttribute("style") };
    const lock =
      "margin:0;padding:0;width:100%;height:100%;overflow:hidden;overscroll-behavior:none;";
    html.setAttribute("style", lock);
    body.setAttribute("style", `${lock}position:fixed;inset:0;touch-action:manipulation;`);
    return () => {
      if (previous.html === null) html.removeAttribute("style");
      else html.setAttribute("style", previous.html);
      if (previous.body === null) body.removeAttribute("style");
      else body.setAttribute("style", previous.body);
    };
  }, []);
}

/** No app desktop, mostra o cursor durante o uso e oculta apos inatividade. */
function useAutoHideCursor(enabled: boolean) {
  useEffect(() => {
    const html = document.documentElement;
    const style = document.createElement("style");
    style.textContent =
      "html.mdi-cursor-hidden, html.mdi-cursor-hidden * { cursor: none !important; }";
    document.head.appendChild(style);

    if (!enabled) {
      html.classList.remove("mdi-cursor-hidden");
      return () => style.remove();
    }

    let timer: ReturnType<typeof setTimeout>;
    const scheduleHide = () => {
      clearTimeout(timer);
      timer = setTimeout(() => html.classList.add("mdi-cursor-hidden"), 2_500);
    };
    const showCursor = () => {
      html.classList.remove("mdi-cursor-hidden");
      scheduleHide();
    };

    window.addEventListener("pointermove", showCursor, { passive: true });
    window.addEventListener("pointerdown", showCursor, { passive: true });
    window.addEventListener("keydown", showCursor);
    scheduleHide();

    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", showCursor);
      window.removeEventListener("pointerdown", showCursor);
      window.removeEventListener("keydown", showCursor);
      html.classList.remove("mdi-cursor-hidden");
      style.remove();
    };
  }, [enabled]);
}

function requestFullscreen() {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  try {
    if (el.requestFullscreen) void el.requestFullscreen();
    else if (el.webkitRequestFullscreen) void el.webkitRequestFullscreen();
  } catch {
    // Alguns navegadores bloqueiam sem gesto do usuário; ignorar silenciosamente.
  }
}

/**
 * Signed storage URLs change at every settings poll. Keep the already loaded
 * bitmap while the underlying file version is unchanged, and preload a new
 * file before swapping it so the kiosk background never flashes.
 */
function useStableAssetUrl(version: string | null, candidate: string | null) {
  const [current, setCurrent] = useState<{ version: string | null; url: string | null }>({
    version: null,
    url: null,
  });

  useEffect(() => {
    if (!candidate || !version) {
      if (current.version !== null || current.url !== null) {
        setCurrent({ version: null, url: null });
      }
      return;
    }
    if (current.version === version && current.url) return;
    const image = new Image();
    image.onload = () => setCurrent({ version, url: candidate });
    image.src = candidate;
    return () => {
      image.onload = null;
    };
  }, [candidate, version, current.version, current.url]);

  // Keep the previous bitmap visible while a genuinely new file is loading.
  return current.url;
}

function KioskPage() {
  const { token: routeToken } = Route.useParams();
  const [deviceToken, setDeviceToken] = useState<string | null>(
    routeToken === "dispositivo" ? null : routeToken,
  );
  const token = deviceToken ?? "";
  const [isDesktopApp, setIsDesktopApp] = useState(false);
  useKioskViewport();
  useAutoHideCursor(isDesktopApp);
  const loadPanel = useServerFn(getKioskPanel);
  const issue = useServerFn(issueKioskTicket);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const panelSnapshot = useRef<KioskPanel>(null);

  // The Android hybrid player shares the universal device token through
  // same-origin localStorage, keeping that credential out of the URL.
  useEffect(() => {
    if (routeToken !== "dispositivo") return;
    setDeviceToken(window.localStorage.getItem("mdi360.deviceToken"));
  }, [routeToken]);

  useEffect(() => {
    const desktopQuery = new URLSearchParams(window.location.search).get("desktop") === "1";
    setIsDesktopApp(desktopBridge()?.isDesktop === true || desktopQuery);
  }, []);

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const { data, isPending } = useQuery({
    queryKey: ["queue-kiosk", token],
    queryFn: async () => {
      const next = await loadPanel({ data: { token } });
      const previous = panelSnapshot.current;
      if (!next) {
        panelSnapshot.current = null;
        return null;
      }

      // URLs assinadas mudam a cada consulta mesmo quando o arquivo não mudou.
      // Reutilizar as URLs já carregadas evita um novo decode/pintura no WebView.
      const normalized = previous
        ? {
            ...next,
            theme: {
              ...next.theme,
              bgImageUrl:
                next.theme.bgImageVersion === previous.theme.bgImageVersion
                  ? previous.theme.bgImageUrl
                  : next.theme.bgImageUrl,
              logoUrl:
                next.theme.logoVersion === previous.theme.logoVersion
                  ? previous.theme.logoUrl
                  : next.theme.logoUrl,
              imageUrl:
                next.theme.imageVersion === previous.theme.imageVersion
                  ? previous.theme.imageUrl
                  : next.theme.imageUrl,
            },
          }
        : next;

      const stable =
        previous && JSON.stringify(normalized) === JSON.stringify(previous) ? previous : normalized;
      panelSnapshot.current = stable;
      return stable;
    },
    enabled: token.length >= 32,
    refetchInterval: 5_000,
    // Android WebViews can remain visually active without reporting browser
    // focus after the native settings screen closes. Keep configuration sync
    // running so later theme changes are not silently ignored.
    refetchIntervalInBackground: true,
  });

  const [pendingKind, setPendingKind] = useState<"normal" | "priority" | null>(null);
  const [issued, setIssued] = useState<{ label: string; sectorName: string | null } | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [checkingPrinter, setCheckingPrinter] = useState(false);

  const issueMutation = useMutation({
    mutationFn: (input: {
      kind: "normal" | "priority";
      sectorId: string | null;
      printEligible: boolean;
    }) =>
      issue({
        data: {
          token,
          sectorId: input.sectorId,
          kind: input.kind,
          printEligible: input.printEligible,
        },
      }),
    onSuccess: (ticket, variables) => {
      setPendingKind(null);
      setIssued({ label: ticket.label, sectorName: ticket.sectorName });
      setIsPrinting(variables.printEligible);
    },
  });

  // Mostra apenas o estado de impressão e retorna ao início após alguns segundos.
  useEffect(() => {
    if (!issued) return;
    const timer = window.setTimeout(() => {
      setIssued(null);
      setIsPrinting(false);
      setPendingKind(null);
    }, 4_000);
    return () => window.clearTimeout(timer);
  }, [issued]);

  const stableBackgroundUrl = useStableAssetUrl(
    data?.theme.bgImageVersion ?? null,
    data?.theme.bgImageUrl ?? null,
  );
  const stableLogoUrl = useStableAssetUrl(
    data?.theme.logoVersion ?? null,
    data?.theme.logoUrl ?? null,
  );
  const stableImageUrl = useStableAssetUrl(
    data?.theme.imageVersion ?? null,
    data?.theme.imageUrl ?? null,
  );

  if (!token || isPending) {
    return (
      <main className="grid h-dvh place-items-center overflow-hidden bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="grid h-dvh place-items-center overflow-hidden bg-background px-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-semibold">Tela de emissão indisponível</h1>
          <p className="mt-2 text-muted-foreground">
            Peça um novo endereço de emissão no painel MDI 360.
          </p>
        </div>
      </main>
    );
  }

  const theme = data.theme;
  const layout = theme.layout;
  const blockStyle = (block: QueueLayoutBlock): React.CSSProperties => ({
    position: "absolute",
    left: `${block.x}%`,
    top: `${block.y}%`,
    width: `${block.w}%`,
    height: `${block.h}%`,
    opacity: block.opacity / 100,
    color: block.color,
    fontSize: `${block.fontSize}cqw`,
    lineHeight: 1,
    textAlign: block.align,
  });
  const contentAlignment = (block: QueueLayoutBlock): React.CSSProperties => ({
    justifyContent:
      block.align === "left" ? "flex-start" : block.align === "right" ? "flex-end" : "center",
    textAlign: block.align,
  });
  const surface = {
    backgroundColor: theme.bgColor,
  } as const;
  const backgroundLayer = stableBackgroundUrl ? (
    <img
      src={stableBackgroundUrl}
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 size-full select-none object-cover"
      draggable={false}
    />
  ) : null;

  if (issued) {
    return (
      <main className="relative grid h-dvh place-items-center overflow-hidden" style={surface}>
        <div
          className="relative overflow-hidden"
          style={{
            width: "min(100vw, calc(100dvh * 16 / 9))",
            height: "min(100dvh, calc(100vw * 9 / 16))",
            aspectRatio: "16 / 9",
            containerType: "inline-size",
            backgroundColor: theme.bgColor,
          }}
        >
          {backgroundLayer}
          {queueLayoutOverlayCss(layout.issuedBackground) ? (
            <div
              className="pointer-events-none absolute inset-0 z-[1]"
              style={{ background: queueLayoutOverlayCss(layout.issuedBackground) }}
            />
          ) : null}
          {stableLogoUrl && !layout.logo.hidden ? (
            <img
              src={stableLogoUrl}
              alt=""
              className="pointer-events-none absolute z-10 object-contain"
              style={{ ...blockStyle(layout.logo), objectPosition: layout.logo.align }}
            />
          ) : null}
          {stableImageUrl && !layout.image.hidden ? (
            <img
              src={stableImageUrl}
              alt=""
              className="pointer-events-none absolute z-10 object-contain"
              style={{ ...blockStyle(layout.image), objectPosition: layout.image.align }}
            />
          ) : null}
          {!layout.issuedTitle.hidden ? (
            <div
              className="absolute z-10 flex items-center overflow-hidden"
              style={{ ...blockStyle(layout.issuedTitle), ...contentAlignment(layout.issuedTitle) }}
            >
              Senha emitida
            </div>
          ) : null}
          <div
            className="absolute z-10 flex items-center overflow-hidden font-semibold"
            style={{
              ...blockStyle(layout.issuedTicket),
              ...contentAlignment(layout.issuedTicket),
            }}
          >
            {issued.label}
          </div>
          {!layout.issuedSector.hidden && issued.sectorName ? (
            <div
              className="absolute z-10 flex items-center overflow-hidden"
              style={{
                ...blockStyle(layout.issuedSector),
                ...contentAlignment(layout.issuedSector),
              }}
            >
              {issued.sectorName}
            </div>
          ) : null}
          {isPrinting && !layout.issuedPrinting.hidden ? (
            <div
              className="absolute z-10 flex items-center overflow-hidden"
              style={{
                ...blockStyle(layout.issuedPrinting),
                ...contentAlignment(layout.issuedPrinting),
              }}
            >
              Imprimindo...
            </div>
          ) : null}
        </div>
      </main>
    );
  }

  const needsSectorChoice = data.sectors.length > 1;
  const submitTicket = async (kind: "normal" | "priority", sectorId: string | null) => {
    if (checkingPrinter || issueMutation.isPending) return;
    setCheckingPrinter(true);
    try {
      const android = (window as unknown as { Android?: { isConnected?: () => boolean } }).Android;
      let printEligible = android?.isConnected ? android.isConnected() : false;
      const bridge = desktopBridge();
      if (bridge?.isPrinterConnected) {
        try {
          printEligible = await bridge.isPrinterConnected();
        } catch {
          printEligible = false;
        }
      }
      issueMutation.mutate({ kind, sectorId, printEligible });
    } finally {
      setCheckingPrinter(false);
    }
  };
  const issueKind = async (kind: "normal" | "priority") => {
    if (needsSectorChoice) {
      setPendingKind(kind);
      return;
    }
    await submitTicket(kind, data.sectors[0]?.id ?? null);
  };

  return (
    <main className="relative grid h-dvh place-items-center overflow-hidden" style={surface}>
      <div
        className="relative overflow-hidden"
        style={{
          width: "min(100vw, calc(100dvh * 16 / 9))",
          height: "min(100dvh, calc(100vw * 9 / 16))",
          aspectRatio: "16 / 9",
          containerType: "inline-size",
          backgroundColor: theme.bgColor,
        }}
      >
        {backgroundLayer}
        {stableImageUrl && !layout.image.hidden ? (
          <img
            src={stableImageUrl}
            alt=""
            className="pointer-events-none z-10 object-contain"
            style={{ ...blockStyle(layout.image), objectPosition: layout.image.align }}
          />
        ) : null}
        {pendingKind && needsSectorChoice ? (
          <Card style={{ backgroundColor: theme.cardColor, borderColor: theme.cardColor }}>
            <CardContent className="space-y-3 py-5">
              <p className="text-sm font-medium" style={{ color: theme.textColor }}>
                {pendingKind === "priority"
                  ? "Senha preferencial · escolha o atendimento"
                  : "Senha normal · escolha o atendimento"}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {data.sectors.map((sector) => (
                  <Button
                    key={sector.id}
                    variant="outline"
                    className="h-20 whitespace-normal text-base font-semibold"
                    style={{
                      backgroundColor:
                        pendingKind === "priority"
                          ? theme.priorityButtonColor
                          : theme.normalButtonColor,
                      color:
                        pendingKind === "priority"
                          ? theme.priorityButtonTextColor
                          : theme.normalButtonTextColor,
                      borderColor: "transparent",
                    }}
                    disabled={checkingPrinter || issueMutation.isPending}
                    onClick={() => void submitTicket(pendingKind, sector.id)}
                  >
                    {sector.name}
                  </Button>
                ))}
              </div>
              <Button
                variant="ghost"
                style={{ color: theme.textColor }}
                onClick={() => setPendingKind(null)}
              >
                Voltar
              </Button>
              {issueMutation.isError ? (
                <p className="text-sm text-destructive">
                  {(issueMutation.error as Error).message || "Não foi possível emitir a senha."}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <>
            {stableLogoUrl && !layout.logo.hidden ? (
              <img
                src={stableLogoUrl}
                alt="Logotipo da empresa"
                className="pointer-events-none z-10 object-contain"
                style={{ ...blockStyle(layout.logo), objectPosition: layout.logo.align }}
              />
            ) : null}
            {!layout.title.hidden ? (
              <h1
                className="z-10 m-0 flex items-center overflow-hidden whitespace-nowrap font-normal"
                style={{ ...blockStyle(layout.title), ...contentAlignment(layout.title) }}
              >
                {theme.title}
              </h1>
            ) : null}
            {!layout.normalButton.hidden ? (
              <button
                type="button"
                className="z-10 flex items-center border-0 font-normal disabled:cursor-wait"
                style={{
                  ...blockStyle(layout.normalButton),
                  ...contentAlignment(layout.normalButton),
                  ...queueButtonStyle(layout.normalButton),
                }}
                disabled={checkingPrinter || issueMutation.isPending}
                onClick={() => issueKind("normal")}
              >
                <QueueButtonContent block={layout.normalButton}>Senha normal</QueueButtonContent>
              </button>
            ) : null}
            {!layout.priorityButton.hidden ? (
              <button
                type="button"
                className="z-10 flex items-center border-0 font-normal disabled:cursor-wait"
                style={{
                  ...blockStyle(layout.priorityButton),
                  ...contentAlignment(layout.priorityButton),
                  ...queueButtonStyle(layout.priorityButton),
                }}
                disabled={checkingPrinter || issueMutation.isPending}
                onClick={() => issueKind("priority")}
              >
                <QueueButtonContent block={layout.priorityButton}>Preferencial</QueueButtonContent>
              </button>
            ) : null}
            {issueMutation.isError ? (
              <p className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 text-sm text-destructive">
                {(issueMutation.error as Error).message || "Não foi possível emitir a senha."}
              </p>
            ) : null}
            {!isFullscreen && !isDesktopApp ? (
              <Button
                variant="ghost"
                size="sm"
                className="absolute bottom-2 right-2 z-20"
                style={{ color: theme.textColor }}
                onClick={requestFullscreen}
              >
                <Maximize className="size-4" />
                Tela cheia
              </Button>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
