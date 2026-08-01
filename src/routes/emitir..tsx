import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-server";
import { Loader2, Ticket, ChevronLeft } from "lucide-react";
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

  const [selectedKind, setSelectedKind] = useState<"normal" | "priority" | null>(null);
  const [issued, setIssued] = useState<{
    label: string;
    kind: string;
    sectorName: string | null;
    waitingAhead: number;
  } | null>(null);

  const issueMutation = useMutation({
    mutationFn: (args: { kind: "normal" | "priority"; sectorId: string | null }) =>
      issue({ data: { token, sectorId: args.sectorId, kind: args.kind } }),
    onSuccess: (ticket) => {
      setIssued({
        label: ticket.label,
        kind: ticket.kind,
        sectorName: ticket.sectorName,
        waitingAhead: ticket.waitingAhead,
      });
      setSelectedKind(null);
    },
  });

  useEffect(() => {
    if (!issued) return;
    const timer = window.setTimeout(() => {
      setIssued(null);
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

  const handleKindSelect = (kind: "normal" | "priority") => {
    if (data.sectors.length > 1) {
      setSelectedKind(kind);
    } else {
      const sectorId = data.sectors.length === 1 ? data.sectors[0].id : null;
      issueMutation.mutate({ kind, sectorId });
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="font-display text-3xl font-semibold">Retire sua senha</h1>
        <p className="text-muted-foreground">{data.panelName}</p>
      </header>

      {!selectedKind ? (
        <Card>
          <CardContent className="space-y-3 py-5">
            <p className="text-sm font-medium text-center">Toque para iniciar</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                size="lg"
                className="h-32 text-xl"
                disabled={issueMutation.isPending}
                onClick={() => handleKindSelect("normal")}
              >
                <Ticket className="size-8" />
                Senha normal
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="h-32 text-xl"
                disabled={issueMutation.isPending}
                onClick={() => handleKindSelect("priority")}
              >
                <Ticket className="size-8" />
                Preferencial
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-4 py-5">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setSelectedKind(null)}>
                <ChevronLeft className="size-5" />
              </Button>
              <p className="text-sm font-medium">
                Escolha o atendimento ({selectedKind === "priority" ? "Preferencial" : "Normal"})
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.sectors.map((sector) => (
                <Button
                  key={sector.id}
                  variant="outline"
                  className="h-16 text-lg"
                  disabled={issueMutation.isPending}
                  onClick={() => issueMutation.mutate({ kind: selectedKind, sectorId: sector.id })}
                >
                  {sector.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {issueMutation.isError ? (
        <p className="text-center text-sm text-destructive font-medium">
          {(issueMutation.error as Error).message || "Não foi possível emitir a senha."}
        </p>
      ) : null}
    </main>
  );
}
