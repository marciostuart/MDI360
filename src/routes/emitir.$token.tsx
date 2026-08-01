import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Ticket } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getKioskPanel, issueKioskTicket } from "@/lib/queue/kiosk.functions";

export const Route = createFileRoute("/emitir/$token")({
  head: () => ({
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
    ],
  }),
  component: KioskPage,
});

function KioskPage() {
  const { token } = Route.useParams();
  const loadPanel = useServerFn(getKioskPanel);
  const issue = useServerFn(issueKioskTicket);

  const { data, isPending } = useQuery({
    queryKey: ["queue-kiosk", token],
    queryFn: () => loadPanel({ data: { token } }),
  });

  const [sectorId, setSectorId] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    label: string;
    kind: string;
    sectorName: string | null;
    waitingAhead: number;
  } | null>(null);

  const issueMutation = useMutation({
    mutationFn: (kind: "normal" | "priority") => issue({ data: { token, sectorId, kind } }),
    onSuccess: (ticket) =>
      setIssued({
        label: ticket.label,
        kind: ticket.kind,
        sectorName: ticket.sectorName,
        waitingAhead: ticket.waitingAhead,
      }),
  });

  // A senha emitida fica na tela por alguns segundos e volta ao início.
  useEffect(() => {
    if (!issued) return;
    const timer = window.setTimeout(() => {
      setIssued(null);
      setSectorId(null);
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [issued]);

  if (isPending) {
    return (
      <main className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-semibold">Tela de emissão indisponível</h1>
          <p className="mt-2 text-muted-foreground">
            Peça um novo endereço de emissão no painel MDI 360.
          </p>
        </div>
      </main>
    );
  }

  if (issued) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6 text-center">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            {issued.kind === "priority" ? "Atendimento preferencial" : "Sua senha"}
          </p>
          <p className="font-display text-8xl font-black">{issued.label}</p>
          {issued.sectorName ? <p className="text-xl">{issued.sectorName}</p> : null}
          <p className="text-muted-foreground">
            {issued.waitingAhead === 0
              ? "Você é o próximo a ser chamado."
              : `${issued.waitingAhead} pessoa(s) na sua frente.`}
          </p>
          <Button variant="outline" onClick={() => setIssued(null)}>
            Emitir outra senha
          </Button>
        </div>
      </main>
    );
  }

  const needsSector = data.mode === "sector";
  const ready = !needsSector || sectorId !== null;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="font-display text-3xl font-semibold">Retire sua senha</h1>
        <p className="text-muted-foreground">{data.panelName}</p>
      </header>

      {needsSector ? (
        <Card>
          <CardContent className="space-y-3 py-5">
            <p className="text-sm font-medium">1 · Escolha o atendimento</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.sectors.length === 0 ? (
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  Nenhum setor cadastrado ainda.
                </p>
              ) : null}
              {data.sectors.map((sector) => (
                <Button
                  key={sector.id}
                  variant={sectorId === sector.id ? "default" : "outline"}
                  className="h-14 text-base"
                  onClick={() => setSectorId(sector.id)}
                >
                  {sector.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-3 py-5">
          <p className="text-sm font-medium">{needsSector ? "2 · " : ""}Toque para emitir</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              size="lg"
              className="h-24 text-lg"
              disabled={!ready || issueMutation.isPending}
              onClick={() => issueMutation.mutate("normal")}
            >
              <Ticket className="size-6" />
              Senha normal
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="h-24 text-lg"
              disabled={!ready || issueMutation.isPending}
              onClick={() => issueMutation.mutate("priority")}
            >
              <Ticket className="size-6" />
              Preferencial
            </Button>
          </div>
          {!ready ? (
            <p className="text-sm text-muted-foreground">Escolha primeiro o atendimento desejado.</p>
          ) : null}
          {issueMutation.isError ? (
            <p className="text-sm text-destructive">
              {(issueMutation.error as Error).message || "Não foi possível emitir a senha."}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
