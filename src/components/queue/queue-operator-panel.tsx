import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Loader2, LogOut, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  callNextTicket,
  fetchQueueState,
  queueLogin,
  queueLogout,
  repeatLastTicket,
} from "@/lib/queue/operator.functions";

export function QueueOperatorPanel() {
  const queryClient = useQueryClient();
  const loadState = useServerFn(fetchQueueState);
  const login = useServerFn(queueLogin);

  const { data, isPending } = useQuery({
    queryKey: ["queue-operator"],
    queryFn: () => loadState({}),
    refetchInterval: 30_000,
  });

  const [credentials, setCredentials] = useState({ username: "", password: "" });

  const loginMutation = useMutation({
    mutationFn: () => login({ data: credentials }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message ?? "Não foi possível entrar.");
        return;
      }
      setCredentials({ username: "", password: "" });
      await queryClient.invalidateQueries({ queryKey: ["queue-operator"] });
    },
    onError: () => toast.error("Não foi possível entrar."),
  });

  if (isPending) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="space-y-4 py-6">
            <div className="space-y-1 text-center">
              <h1 className="font-display text-xl font-semibold">Chamada de senhas</h1>
              <p className="text-sm text-muted-foreground">
                Entre com o acesso do operador criado no painel MDI 360.
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
                <Label htmlFor="queue-user">Usuário</Label>
                <Input
                  id="queue-user"
                  value={credentials.username}
                  autoComplete="username"
                  onChange={(event) =>
                    setCredentials((value) => ({ ...value, username: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="queue-pass">Senha</Label>
                <Input
                  id="queue-pass"
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
      </div>
    );
  }

  return <OperatorConsole state={data} />;
}

function OperatorConsole({
  state,
}: {
  state: NonNullable<Awaited<ReturnType<typeof fetchQueueState>>>;
}) {
  const queryClient = useQueryClient();
  const callNext = useServerFn(callNextTicket);
  const repeat = useServerFn(repeatLastTicket);
  const logout = useServerFn(queueLogout);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["queue-operator"] });

  const callMutation = useMutation({
    mutationFn: (sectorId: string | null) => callNext({ data: { sectorId } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.warning(result.message ?? "Nenhuma senha aguardando na fila.");
        await invalidate();
        return;
      }
      toast.success(
        result.kind === "priority"
          ? `Senha preferencial ${result.label} chamada na TV.`
          : `Senha ${result.label} chamada na TV.`,
      );
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível chamar."),
  });

  const repeatMutation = useMutation({
    mutationFn: () => repeat({}),
    onSuccess: async (result) => {
      toast.success(`Repetindo a senha ${result.label}.`);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Nenhuma senha para repetir."),
  });

  const logoutMutation = useMutation({
    mutationFn: () => logout({}),
    onSuccess: invalidate,
  });

  // A rechamada sempre usa a última senha do painel e a transfere para o
  // guichê do operador que clicar no botão.
  const last = state.calls[0] ?? null;
  const mine = last?.mine === true;
  const isSector = state.sectors.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Chamada de senhas</h1>
          <p className="text-sm text-muted-foreground">
            {state.operator.name}
            {state.operator.deskLabel ? ` · ${state.operator.deskLabel}` : ""} · TV:{" "}
            {state.panel.deviceName}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => logoutMutation.mutate()}>
          <LogOut className="size-4" />
          Sair
        </Button>
      </header>

      <Card>
        <CardContent className="space-y-5 py-6">
          <div className="text-center">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {mine ? "Senha em atendimento neste guichê" : "Última senha chamada"}
            </p>
            <p className="font-display text-6xl font-black">{last?.label ?? "—"}</p>
            {last?.sectorName ? (
              <p className="text-sm text-muted-foreground">{last.sectorName}</p>
            ) : null}
            {mine ? null : last ? (
              <p className="text-xs text-muted-foreground">Chamada por outro guichê</p>
            ) : null}
            {last?.kind === "priority" ? (
              <Badge className="mt-2">Preferencial</Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-center gap-2 text-sm">
            <Badge variant="secondary">Aguardando: {state.waiting.normal} normal</Badge>
            <Badge variant="secondary">{state.waiting.priority} preferencial</Badge>
            <Badge variant="outline">
              {state.panel.priorityPolicy === "alternate"
                ? "Preferenciais intercaladas"
                : "Preferenciais primeiro"}
            </Badge>
          </div>

          {isSector ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {state.sectors.length === 0 ? (
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  Nenhuma fila designada para você. Fale com o responsável pelo painel MDI 360.
                </p>
              ) : null}
              {state.sectors.map((sector) => (
                <Button
                  key={sector.id}
                  size="lg"
                  className="h-16 justify-between text-base"
                  disabled={callMutation.isPending}
                  onClick={() => callMutation.mutate(sector.id)}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Bell className="size-5" />
                    <span className="truncate">{sector.name}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    {sector.waitingPriority > 0 ? (
                      <Badge variant="destructive">{sector.waitingPriority}P</Badge>
                    ) : null}
                    <Badge variant="secondary">{sector.waitingNormal}</Badge>
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            <Button
              size="lg"
              className="h-20 w-full text-lg"
              disabled={callMutation.isPending}
              onClick={() => callMutation.mutate(null)}
            >
              <Bell className="size-6" />
              Chamar próxima senha
            </Button>
          )}

          <Button
            variant="outline"
            className="w-full"
            disabled={repeatMutation.isPending || !last}
            onClick={() => repeatMutation.mutate()}
          >
            <RotateCcw className="size-4" />
            Repetir última chamada neste guichê
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-5">
          <p className="mb-3 text-sm font-medium">Histórico recente</p>
          <div className="space-y-1.5">
            {state.calls.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma chamada ainda.</p>
            ) : null}
            {state.calls.map((call) => (
              <div
                key={call.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="font-semibold">
                  {call.label}
                  {call.kind === "priority" ? " · preferencial" : ""}
                  {call.mine ? " · meu guichê" : ""}
                </span>
                <span className="text-muted-foreground">
                  {call.sectorName ? `${call.sectorName} · ` : ""}
                  {new Date(call.calledAt).toLocaleTimeString("pt-BR")}
                  {call.repeatCount > 0 ? ` · ${call.repeatCount}x repetida` : ""}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
