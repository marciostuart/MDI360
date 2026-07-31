import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, Ticket, Trash2, Tv } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  deleteQueuePanel,
  listQueuePanels,
  saveQueuePanel,
  setQueuePanelEnabled,
  type QueuePanelSummary,
} from "@/lib/queue/queue.functions";

/**
 * Studio screen for the queue add-on. Enabling it on a TV creates a dedicated
 * operator login that only reaches the queue panel — never the content library.
 */
export function QueueAddonManager() {
  const queryClient = useQueryClient();
  const fetchPanels = useServerFn(listQueuePanels);
  const savePanel = useServerFn(saveQueuePanel);
  const togglePanel = useServerFn(setQueuePanelEnabled);
  const removePanel = useServerFn(deleteQueuePanel);

  const { data, isPending } = useQuery({
    queryKey: ["queue-panels"],
    queryFn: () => fetchPanels({}),
    refetchInterval: 20_000,
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: "",
    password: "",
    mode: "sequential",
    displaySeconds: 20,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["queue-panels"] });

  const saveMutation = useMutation({
    mutationFn: (input: {
      deviceId: string;
      username: string;
      password?: string;
      mode: "sequential" | "sector";
      displaySeconds: number;
    }) => savePanel({ data: input }),
    onSuccess: async () => {
      toast.success("Painel de senhas salvo.");
      setEditing(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível salvar."),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { deviceId: string; isEnabled: boolean }) => togglePanel({ data: input }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (deviceId: string) => removePanel({ data: { deviceId } }),
    onSuccess: async () => {
      toast.success("Add-on removido desta tela.");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const startEdit = (panel: QueuePanelSummary) => {
    setEditing(panel.deviceId);
    setForm({
      username: panel.username ?? "",
      password: "",
      mode: panel.mode === "sector" ? "sector" : "sequential",
      displaySeconds: panel.displaySeconds,
    });
  };

  if (isPending) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const panels = data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">Sistema de senhas</h1>
        <p className="text-sm text-muted-foreground">
          Habilite a chamada de senhas por tela. Ao chamar, a TV interrompe a playlist, emite o sinal
          sonoro e anuncia a senha em voz alta — mesmo com o som da tela desativado.
        </p>
        <a
          href="/senhas"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"
        >
          Abrir painel do operador <ExternalLink className="size-3.5" />
        </a>
      </header>

      {panels.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma tela vinculada ainda. Vincule uma tela em <strong>Telas</strong> para habilitar o
            sistema de senhas.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {panels.map((panel) => (
          <Card key={panel.deviceId}>
            <CardContent className="space-y-4 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-muted">
                    <Tv className="size-4" />
                  </span>
                  <div>
                    <p className="font-medium">{panel.deviceName}</p>
                    <p className="text-xs text-muted-foreground">
                      {panel.deviceOnline ? "Online" : "Offline"}
                      {panel.username ? ` · operador: ${panel.username}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {panel.lastCallLabel ? (
                    <Badge variant="secondary">Última: {panel.lastCallLabel}</Badge>
                  ) : null}
                  {panel.panelId ? (
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`enabled-${panel.deviceId}`}
                        checked={panel.isEnabled}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({ deviceId: panel.deviceId, isEnabled: checked })
                        }
                      />
                      <Label htmlFor={`enabled-${panel.deviceId}`} className="text-xs">
                        Ativo
                      </Label>
                    </div>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => startEdit(panel)}>
                    <Ticket className="size-4" />
                    {panel.panelId ? "Editar acesso" : "Habilitar"}
                  </Button>
                  {panel.panelId ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => deleteMutation.mutate(panel.deviceId)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>

              {editing === panel.deviceId ? (
                <form
                  className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveMutation.mutate({
                      deviceId: panel.deviceId,
                      username: form.username,
                      password: form.password || undefined,
                      mode: form.mode === "sector" ? "sector" : "sequential",
                      displaySeconds: form.displaySeconds,
                    });
                  }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor={`user-${panel.deviceId}`}>Usuário do operador</Label>
                    <Input
                      id={`user-${panel.deviceId}`}
                      value={form.username}
                      autoComplete="off"
                      onChange={(event) =>
                        setForm((value) => ({ ...value, username: event.target.value }))
                      }
                      placeholder="recepcao.loja1"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`pass-${panel.deviceId}`}>
                      Senha {panel.panelId ? "(deixe vazio para manter)" : ""}
                    </Label>
                    <Input
                      id={`pass-${panel.deviceId}`}
                      type="password"
                      value={form.password}
                      autoComplete="new-password"
                      onChange={(event) =>
                        setForm((value) => ({ ...value, password: event.target.value }))
                      }
                      placeholder="••••••"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Modo de chamada</Label>
                    <Select
                      value={form.mode}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, mode: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sequential">Numérico sequencial</SelectItem>
                        <SelectItem value="sector">Por setor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`secs-${panel.deviceId}`}>Tempo na tela (segundos)</Label>
                    <Input
                      id={`secs-${panel.deviceId}`}
                      type="number"
                      min={5}
                      max={120}
                      value={form.displaySeconds}
                      onChange={(event) =>
                        setForm((value) => ({
                          ...value,
                          displaySeconds: Number(event.target.value) || 20,
                        }))
                      }
                    />
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <Button type="submit" disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                      Salvar
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
