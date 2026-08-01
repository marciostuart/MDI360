import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LogOut, Printer, Ticket } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { signIn, signOut } from "@/lib/auth/auth.functions";
import { fetchIssuerState, issueTicketAsCustomer } from "@/lib/queue/kiosk.functions";

type Issued = {
  label: string;
  kind: string;
  sectorName: string | null;
  waitingAhead: number;
  panelName: string;
  issuedAt: string;
};

const AUTO_PRINT_KEY = "mdi_issuer_autoprint";

/** Monta o cupom de 80mm e manda para a impressora térmica do dispositivo. */
function printTicket(ticket: Issued) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.visibility = "hidden";
  document.body.appendChild(frame);

  const when = new Date(ticket.issuedAt).toLocaleString("pt-BR");
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Senha ${ticket.label}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body { width: 80mm; font-family: "Helvetica Neue", Arial, sans-serif; color: #000;
         text-align: center; padding: 6mm 4mm 10mm; }
  .place { font-size: 13px; font-weight: 700; text-transform: uppercase; }
  .kind { font-size: 12px; margin-top: 2mm; letter-spacing: 1px; text-transform: uppercase; }
  .label { font-size: 62px; font-weight: 900; line-height: 1; margin: 4mm 0; }
  .sector { font-size: 20px; font-weight: 700; margin-bottom: 3mm; }
  .info { font-size: 12px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 4mm 0; }
</style></head><body>
  <div class="place">${ticket.panelName}</div>
  <div class="kind">${ticket.kind === "priority" ? "Atendimento preferencial" : "Senha de atendimento"}</div>
  <div class="label">${ticket.label}</div>
  ${ticket.sectorName ? `<div class="sector">${ticket.sectorName}</div>` : ""}
  <hr />
  <div class="info">${when}</div>
  <div class="info">${
    ticket.waitingAhead === 0
      ? "Você é o próximo a ser chamado"
      : `${ticket.waitingAhead} pessoa(s) na sua frente`
  }</div>
  <div class="info">Aguarde a chamada no painel</div>
</body></html>`);
  doc.close();

  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 2000);
  };
  if (frame.contentWindow?.document.readyState === "complete") run();
  else frame.onload = run;
}

export function QueueIssuerPanel() {
  const queryClient = useQueryClient();
  const loadState = useServerFn(fetchIssuerState);
  const login = useServerFn(signIn);
  const logout = useServerFn(signOut);
  const issue = useServerFn(issueTicketAsCustomer);

  // Reconsulta contínua: o que o cliente libera no painel aparece aqui em
  // poucos segundos, sem precisar recarregar o terminal.
  const { data, isPending } = useQuery({
    queryKey: ["queue-issuer"],
    queryFn: () => loadState({}),
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });

  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [panelId, setPanelId] = useState<string | null>(null);
  /** Tipo escolhido no primeiro toque; a fila é escolhida na etapa seguinte. */
  const [pendingKind, setPendingKind] = useState<"normal" | "priority" | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [autoPrint, setAutoPrint] = useState(true);
  const autoPrintRef = useRef(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(AUTO_PRINT_KEY);
    if (stored !== null) {
      const value = stored === "1";
      setAutoPrint(value);
      autoPrintRef.current = value;
    }
  }, []);

  const panels = data?.panels ?? [];
  const panel = useMemo(
    () => panels.find((item) => item.panelId === panelId) ?? panels[0] ?? null,
    [panels, panelId],
  );

  const sectors = panel?.sectors ?? [];
  // Se a tela tem setores liberados para emissão, a escolha do atendimento é
  // sempre perguntada — independente do modo de chamada configurado no painel.
  const needsSector = sectors.length > 0;

  const loginMutation = useMutation({
    mutationFn: () => login({ data: credentials }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message ?? "Não foi possível entrar.");
        return;
      }
      setCredentials({ email: "", password: "" });
      await queryClient.invalidateQueries({ queryKey: ["queue-issuer"] });
    },
    onError: () => toast.error("Não foi possível entrar."),
  });

  const issueMutation = useMutation({
    mutationFn: (vars: { kind: "normal" | "priority"; sectorId: string | null }) => {
      if (!panel) throw new Error("Nenhuma tela liberada para emissão.");
      return issue({
        data: { panelId: panel.panelId, sectorId: vars.sectorId, kind: vars.kind },
      });
    },
    onSuccess: (ticket) => {
      setPendingKind(null);
      const next: Issued = {
        label: ticket.label,
        kind: ticket.kind,
        sectorName: ticket.sectorName,
        waitingAhead: ticket.waitingAhead,
        panelName: ticket.panelName,
        issuedAt: ticket.issuedAt,
      };
      setIssued(next);
      if (autoPrintRef.current) printTicket(next);
    },
    onError: (error) => toast.error((error as Error).message || "Não foi possível emitir a senha."),
  });

  /**
   * Toque no tipo de senha: em modo setorizado a fila é SEMPRE escolhida
   * (mesmo com uma só), para a pessoa ver para qual atendimento a senha é
   * emitida. No modo sequencial emite direto.
   */
  const chooseKind = (kind: "normal" | "priority") => {
    if (needsSector && sectors.length > 0) {
      setPendingKind(kind);
      return;
    }
    issueMutation.mutate({ kind, sectorId: null });
  };

  // A senha emitida fica alguns segundos na tela e volta ao início.
  useEffect(() => {
    if (!issued) return;
    const timer = window.setTimeout(() => setIssued(null), 12_000);
    return () => window.clearTimeout(timer);
  }, [issued]);

  if (isPending) {
    return (
      <main className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="space-y-4 py-6">
            <div className="space-y-1 text-center">
              <h1 className="font-display text-xl font-semibold">Terminal de emissão</h1>
              <p className="text-sm text-muted-foreground">
                Entre com o mesmo e-mail e senha do seu painel MDI 360.
              </p>
            </div>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                loginMutation.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="issuer-email">E-mail</Label>
                <Input
                  id="issuer-email"
                  type="email"
                  value={credentials.email}
                  autoComplete="email"
                  onChange={(event) =>
                    setCredentials((value) => ({ ...value, email: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="issuer-password">Senha</Label>
                <Input
                  id="issuer-password"
                  type="password"
                  value={credentials.password}
                  autoComplete="current-password"
                  onChange={(event) =>
                    setCredentials((value) => ({ ...value, password: event.target.value }))
                  }
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Entrar
              </Button>
            </form>
          </CardContent>
        </Card>
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
          {issued.sectorName ? (
            <p className="font-display text-2xl font-semibold text-primary">{issued.sectorName}</p>
          ) : null}
          <p className="font-display text-8xl font-black">{issued.label}</p>
          <p className="text-muted-foreground">
            {issued.waitingAhead === 0
              ? "Você é o próximo a ser chamado."
              : `${issued.waitingAhead} pessoa(s) na sua frente.`}
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button variant="outline" onClick={() => printTicket(issued)}>
              <Printer className="size-4" />
              Imprimir novamente
            </Button>
            <Button onClick={() => setIssued(null)}>Emitir outra senha</Button>
          </div>
        </div>
      </main>
    );
  }

  const ready = Boolean(panel);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="font-display text-3xl font-semibold">Retire sua senha</h1>
        <p className="text-muted-foreground">{panel?.panelName ?? "Nenhuma tela liberada"}</p>
      </header>

      {panels.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma tela está liberada para emissão. Ative a emissão em{" "}
            <strong>Sistema de senhas</strong>, no seu painel.
          </CardContent>
        </Card>
      ) : null}

      {panels.length > 1 ? (
        <Card>
          <CardContent className="space-y-3 py-5">
            <p className="text-sm font-medium">Tela de atendimento</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {panels.map((item) => (
                <Button
                  key={item.panelId}
                  variant={panel?.panelId === item.panelId ? "default" : "outline"}
                  className="h-12"
                  onClick={() => {
                    setPanelId(item.panelId);
                    setPendingKind(null);
                  }}
                >
                  {item.panelName}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {panel?.mode === "sector" && sectors.length === 0 && panels.length > 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Esta tela está em modo setorizado, mas nenhuma fila está liberada para emissão. Ative a
            emissão de cada fila em <strong>Sistema de senhas</strong>.
          </CardContent>
        </Card>
      ) : null}

      {pendingKind ? (
        /* Etapa 2 · a fila só é perguntada quando existe mais de uma. */
        <Card>
          <CardContent className="space-y-3 py-5">
            <p className="text-sm font-medium">
              {pendingKind === "priority"
                ? "Senha preferencial · para qual atendimento?"
                : "Senha normal · para qual atendimento?"}
            </p>
            <p className="text-xs text-muted-foreground">
              Cada atendimento tem sua própria fila e numeração.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {sectors.map((sector) => (
                <Button
                  key={sector.id}
                  variant="outline"
                  className="h-20 whitespace-normal text-base font-semibold"
                  disabled={issueMutation.isPending}
                  onClick={() => issueMutation.mutate({ kind: pendingKind, sectorId: sector.id })}
                >
                  {sector.name}
                </Button>
              ))}
            </div>
            <Button variant="ghost" onClick={() => setPendingKind(null)}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-3 py-5">
            <p className="text-sm font-medium">Toque no tipo de senha</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                size="lg"
                className="h-24 text-lg"
                disabled={!ready || issueMutation.isPending}
                onClick={() => chooseKind("normal")}
              >
                <Ticket className="size-6" />
                Senha normal
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="h-24 text-lg"
                disabled={!ready || issueMutation.isPending}
                onClick={() => chooseKind("priority")}
              >
                <Ticket className="size-6" />
                Preferencial
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
        <div className="flex items-center gap-3">
          <Printer className="size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Imprimir automaticamente</p>
            <p className="text-xs text-muted-foreground">
              Envia o cupom para a impressora térmica deste dispositivo.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Switch
            checked={autoPrint}
            onCheckedChange={(checked) => {
              setAutoPrint(checked);
              autoPrintRef.current = checked;
              window.localStorage.setItem(AUTO_PRINT_KEY, checked ? "1" : "0");
            }}
            aria-label="Imprimir automaticamente"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await logout({});
              await queryClient.invalidateQueries({ queryKey: ["queue-issuer"] });
            }}
          >
            <LogOut className="size-4" />
            Sair ({data.userName})
          </Button>
        </div>
      </div>
    </main>
  );
}
