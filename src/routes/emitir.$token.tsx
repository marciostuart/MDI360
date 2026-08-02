import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Maximize, Ticket } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getKioskPanel, issueKioskTicket } from "@/lib/queue/kiosk.functions";

// Ponte opcional com o aplicativo desktop (MDI360 Emissor) para impressão térmica automática.
type DesktopBridge = {
  isDesktop?: boolean;
  printTicket?: (payload: {
    label: string;
    kind: string;
    sectorName: string | null;
    panelName: string;
    issuedAt: string;
    waitingAhead: number;
  }) => Promise<{ ok: boolean; error?: string }>;
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
    const lock = "margin:0;padding:0;width:100%;height:100%;overflow:hidden;overscroll-behavior:none;";
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

function KioskPage() {
  const { token } = Route.useParams();
  useKioskViewport();
  const loadPanel = useServerFn(getKioskPanel);
  const issue = useServerFn(issueKioskTicket);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const { data, isPending } = useQuery({
    queryKey: ["queue-kiosk", token],
    queryFn: () => loadPanel({ data: { token } }),
    refetchInterval: 5_000,
  });

  const [pendingKind, setPendingKind] = useState<"normal" | "priority" | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    label: string;
    kind: string;
    sectorName: string | null;
    waitingAhead: number;
  } | null>(null);

  const issueMutation = useMutation({
    mutationFn: (input: { kind: "normal" | "priority"; sectorId: string | null }) =>
      issue({ data: { token, sectorId: input.sectorId, kind: input.kind } }),
    onSuccess: (ticket) => {
      setPendingKind(null);
      setPrintError(null);
      setIssued({
        label: ticket.label,
        kind: ticket.kind,
        sectorName: ticket.sectorName,
        waitingAhead: ticket.waitingAhead,
      });
      const bridge = desktopBridge();
      if (bridge?.printTicket) {
        void bridge
          .printTicket({
            label: ticket.label,
            kind: ticket.kind,
            sectorName: ticket.sectorName,
            panelName: data?.panelName ?? "",
            issuedAt: new Date().toLocaleString("pt-BR"),
            waitingAhead: ticket.waitingAhead,
          })
          .then((result) => {
            if (!result?.ok) setPrintError(result?.error ?? "Não foi possível imprimir a senha.");
          })
          .catch((error: unknown) => {
            setPrintError(error instanceof Error ? error.message : "Falha na impressão.");
          });
      }
    },
  });

  // A senha emitida fica na tela por alguns segundos e volta ao início.
  useEffect(() => {
    if (!issued) return;
    const timer = window.setTimeout(() => {
      setIssued(null);
      setPendingKind(null);
    }, 3_000);
    return () => window.clearTimeout(timer);
  }, [issued]);

  if (isPending) {
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
  const surface = {
    backgroundColor: theme.bgColor,
    ...(theme.bgImageUrl
      ? {
          backgroundImage: `url("${theme.bgImageUrl}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : {}),
  } as const;

  if (issued) {
    return (
      <main className="grid h-dvh place-items-center overflow-hidden px-6 text-center" style={surface}>
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-widest" style={{ color: theme.textColor }}>
            {issued.kind === "priority" ? "Atendimento preferencial" : "Sua senha"}
          </p>
          <p className="font-display text-8xl font-black" style={{ color: theme.titleColor }}>
            {issued.label}
          </p>
          {issued.sectorName ? (
            <p className="text-xl" style={{ color: theme.titleColor }}>
              {issued.sectorName}
            </p>
          ) : null}
          {printError ? <p className="text-sm text-destructive">{printError}</p> : null}
          <Button
            variant="outline"
            style={{
              backgroundColor: theme.cardColor,
              color: theme.titleColor,
              borderColor: theme.textColor,
            }}
            onClick={() => setIssued(null)}
          >
            Emitir outra senha
          </Button>
        </div>
      </main>
    );
  }

  const needsSectorChoice = data.sectors.length > 1;
  const issueKind = (kind: "normal" | "priority") => {
    if (needsSectorChoice) {
      setPendingKind(kind);
      return;
    }
    issueMutation.mutate({ kind, sectorId: data.sectors[0]?.id ?? null });
  };

  return (
    <main className="h-dvh overflow-hidden" style={surface}>
      <div className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-6 p-6">
      <header className="space-y-2 text-center">
        {theme.logoUrl ? (
          <img
            src={theme.logoUrl}
            alt="Logotipo da empresa"
            className="mx-auto w-auto object-contain"
            style={{ maxHeight: `${theme.logoHeight}px` }}
          />
        ) : null}
        <h1 className="font-display text-3xl font-semibold" style={{ color: theme.titleColor }}>
          {theme.title}
        </h1>
        {!isFullscreen ? (
          <Button
            variant="ghost"
            size="sm"
            style={{ color: theme.textColor }}
            onClick={requestFullscreen}
          >
            <Maximize className="size-4" />
            Tela cheia
          </Button>
        ) : null}
      </header>

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
                  disabled={issueMutation.isPending}
                  onClick={() => issueMutation.mutate({ kind: pendingKind, sectorId: sector.id })}
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
        <Card style={{ backgroundColor: theme.cardColor, borderColor: theme.cardColor }}>
          <CardContent className="space-y-3 py-5">
            <p className="text-sm font-medium" style={{ color: theme.textColor }}>
              Toque no tipo de senha
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                size="lg"
                className="h-24 text-lg"
                style={{
                  backgroundColor: theme.normalButtonColor,
                  color: theme.normalButtonTextColor,
                }}
                disabled={issueMutation.isPending}
                onClick={() => issueKind("normal")}
              >
                <Ticket className="size-6" />
                Senha normal
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="h-24 text-lg"
                style={{
                  backgroundColor: theme.priorityButtonColor,
                  color: theme.priorityButtonTextColor,
                }}
                disabled={issueMutation.isPending}
                onClick={() => issueKind("priority")}
              >
                <Ticket className="size-6" />
                Preferencial
              </Button>
            </div>
            {issueMutation.isError ? (
              <p className="text-sm text-destructive">
                {(issueMutation.error as Error).message || "Não foi possível emitir a senha."}
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
      </div>
    </main>
  );
}
