import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Loader2, LogOut, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  callNextTicket,
  deleteQueueSector,
  fetchQueueState,
  queueLogin,
  queueLogout,
  repeatLastTicket,
  resetQueueCounters,
  saveQueueSector,
  setQueueMode,
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

function OperatorConsole({ state }: { state: NonNullable<Awaited<ReturnType<typeof fetchQueueState>>> }) {
  const queryClient = useQueryClient();
  const callNext = useServerFn(callNextTicket);
  const repeat = useServerFn(repeatLastTicket);
  const saveSector = useServerFn(saveQueueSector);
  const removeSector = useServerFn(deleteQueueSector);
  const changeMode = useServerFn(setQueueMode);
  const reset = useServerFn(resetQueueCounters);
  const logout = useServerFn(queueLogout);

  const [sectorName, setSectorName] = useState("");
  const [sectorPrefix, setSectorPrefix] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string; prefix: string } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["queue-operator"] });

  const callMutation = useMutation({
    mutationFn: (sectorId: string | null) => callNext({ data: { sectorId } }),
    onSuccess: async (result) => {
      toast.success(`Senha ${result.label} chamada na TV.`);
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

  const sectorMutation = useMutation({
    mutationFn: () =>
      saveSector({ data: { name: sectorName, prefix: sectorPrefix || undefined } }),
    onSuccess: async () => {
      setSectorName("");
      setSectorPrefix("");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteSectorMutation = useMutation({
    mutationFn: (sectorId: string) => removeSector({ data: { sectorId } }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const editSectorMutation = useMutation({
    mutationFn: () =>
      saveSector({
        data: {
          sectorId: editing!.id,
          name: editing!.name,
          prefix: editing!.prefix || undefined,
        },
      }),
    onSuccess: async () => {
      setEditing(null);
      toast.success("Setor atualizado.");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const modeMutation = useMutation({
    mutationFn: (mode: "sequential" | "sector") => changeMode({ data: { mode } }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const resetMutation = useMutation({
    mutationFn: () => reset({}),
    onSuccess: async () => {
      toast.success("Contadores zerados.");
      await invalidate();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => logout({}),
    onSuccess: invalidate,
  });

  const last = state.calls[0] ?? null;
  const isSector = state.panel.mode === "sector";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Chamada de senhas</h1>
          <p className="text-sm text-muted-foreground">TV: {state.panel.deviceName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={isSector ? "sector" : "sequential"}
            onValueChange={(value) => modeMutation.mutate(value as "sequential" | "sector")}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sequential">Numérico sequencial</SelectItem>
              <SelectItem value="sector">Por setor</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => logoutMutation.mutate()}>
            <LogOut className="size-4" />
            Sair
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="space-y-5 py-6">
          <div className="text-center">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Última senha chamada
            </p>
            <p className="font-display text-6xl font-black">{last?.label ?? "—"}</p>
            {last?.sectorName ? (
              <p className="text-sm text-muted-foreground">{last.sectorName}</p>
            ) : null}
          </div>

          {isSector ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {state.sectors.length === 0 ? (
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  Cadastre um setor abaixo para começar a chamar.
                </p>
              ) : null}
              {state.sectors.map((sector) => (
                <div key={sector.id} className="flex items-center gap-2">
                  <Button
                    size="lg"
                    className="h-16 flex-1 text-base"
                    disabled={callMutation.isPending}
                    onClick={() => callMutation.mutate(sector.id)}
                  >
                    <Bell className="size-5" />
                    <span className="truncate">
                      {sector.prefix ? `${sector.prefix} · ` : ""}
                      {sector.name}
                    </span>
                    <Badge variant="secondary" className="ml-2">
                      {sector.lastNumber}
                    </Badge>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${sector.name}`}
                    onClick={() =>
                      setEditing({ id: sector.id, name: sector.name, prefix: sector.prefix ?? "" })
                    }
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label={`Remover ${sector.name}`}
                    onClick={() => deleteSectorMutation.mutate(sector.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
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

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={repeatMutation.isPending || !last}
              onClick={() => repeatMutation.mutate()}
            >
              <RotateCcw className="size-4" />
              Repetir última chamada
            </Button>
            <Button variant="ghost" onClick={() => resetMutation.mutate()}>
              Zerar contadores
            </Button>
          </div>
        </CardContent>
      </Card>

      {isSector ? (
        <Card>
          <CardContent className="py-5">
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                sectorMutation.mutate();
              }}
            >
              <div className="min-w-40 flex-1 space-y-1.5">
                <Label htmlFor="sector-name">Novo setor</Label>
                <Input
                  id="sector-name"
                  value={sectorName}
                  onChange={(event) => setSectorName(event.target.value)}
                  placeholder="Caixa, Farmácia, Atendimento…"
                  required
                />
              </div>
              <div className="w-28 space-y-1.5">
                <Label htmlFor="sector-prefix">Prefixo</Label>
                <Input
                  id="sector-prefix"
                  value={sectorPrefix}
                  maxLength={3}
                  onChange={(event) => setSectorPrefix(event.target.value.toUpperCase())}
                  placeholder="C"
                />
              </div>
              <Button type="submit" disabled={sectorMutation.isPending}>
                <Plus className="size-4" />
                Adicionar
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

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
                <span className="font-semibold">{call.label}</span>
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

      <Dialog open={editing !== null} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar setor</DialogTitle>
          </DialogHeader>
          {editing ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                editSectorMutation.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="edit-sector-name">Nome</Label>
                <Input
                  id="edit-sector-name"
                  value={editing.name}
                  onChange={(event) =>
                    setEditing((value) => (value ? { ...value, name: event.target.value } : value))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-sector-prefix">Prefixo</Label>
                <Input
                  id="edit-sector-prefix"
                  value={editing.prefix}
                  maxLength={3}
                  placeholder="C"
                  onChange={(event) =>
                    setEditing((value) =>
                      value ? { ...value, prefix: event.target.value.toUpperCase() } : value,
                    )
                  }
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={editSectorMutation.isPending}>
                  {editSectorMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
