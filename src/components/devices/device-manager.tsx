import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2, MonitorSmartphone, RefreshCw, Trash2, Tv } from "lucide-react";
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
import {
  deleteDevice,
  linkDevice,
  listDevices,
  sendDeviceCommand,
} from "@/lib/devices/devices.functions";
import { CANVAS_PRESETS, DEFAULT_CANVAS_PRESET, getCanvasPreset } from "@/lib/media/presets";

function formatLastSeen(iso: string | null) {
  if (!iso) return "nunca conectou";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} dias`;
}

export function DeviceManager() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listDevices);
  const linkFn = useServerFn(linkDevice);
  const deleteFn = useServerFn(deleteDevice);
  const commandFn = useServerFn(sendDeviceCommand);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [presetId, setPresetId] = useState(DEFAULT_CANVAS_PRESET.id);

  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: () => listFn({}),
    refetchInterval: 30_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["devices"] });

  const linkMutation = useMutation({
    mutationFn: () =>
      linkFn({ data: { code: code.trim().toUpperCase(), name: name.trim(), canvasPreset: presetId } }),
    onSuccess: async () => {
      toast.success("Tela vinculada. O aparelho começa a exibir na próxima sincronização.");
      setName("");
      setCode("");
      await refresh();
    },
    onError: () =>
      toast.error("Código inválido ou já utilizado. Confira o código exibido na TV."),
  });

  const removeMutation = useMutation({
    mutationFn: (deviceId: string) => deleteFn({ data: { deviceId } }),
    onSuccess: async () => {
      toast.success("Tela desvinculada. O aparelho apaga o cache e mostra um novo código.");
      await refresh();
    },
    onError: () => toast.error("Não foi possível remover esta tela."),
  });

  const commandMutation = useMutation({
    mutationFn: (vars: { deviceId: string; kind: "reload" | "restart" }) =>
      commandFn({ data: vars }),
    onSuccess: () => toast.success("Comando enviado. A tela executa no próximo contato."),
    onError: () => toast.error("Não foi possível enviar o comando."),
  });

  const items = devices.data?.items ?? [];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Telas</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre cada TV, informe o código de 6 dígitos no aplicativo instalado no aparelho e
          acompanhe se a tela está online.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="device-name">Nome da tela</Label>
            <Input
              id="device-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Recepção — TV da entrada"
              maxLength={120}
            />
          </div>
          <div className="space-y-2 md:w-72">
            <Label>Formato da tela</Label>
            <Select value={presetId} onValueChange={setPresetId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANVAS_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Cadastrar tela
          </Button>
        </CardContent>
      </Card>

      {devices.isPending ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center gap-2 py-16 text-center">
            <MonitorSmartphone className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">Nenhuma tela cadastrada ainda</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Cadastre a primeira TV acima. Em seguida abra o aplicativo no aparelho e digite o
              código de pareamento exibido aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((device) => {
            const preset = getCanvasPreset(device.canvasPreset);
            return (
              <Card key={device.id}>
                <CardContent className="space-y-4 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{device.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{preset.label}</p>
                    </div>
                    <Badge variant={device.online ? "default" : "secondary"}>
                      {device.online ? "online" : "offline"}
                    </Badge>
                  </div>

                  {device.pairingCode ? (
                    <div className="rounded-lg border border-dashed border-border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Código de pareamento</p>
                      <p className="font-display text-2xl font-semibold tracking-[0.3em]">
                        {device.pairingCode}
                      </p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Abra <span className="font-medium">/tela</span> no aparelho e digite este
                        código.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Tv className="size-4" />
                      Pareada · visto {formatLastSeen(device.lastSeenAt)}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        commandMutation.mutate({ deviceId: device.id, kind: "reload" })
                      }
                      disabled={device.status !== "active"}
                    >
                      <RefreshCw className="size-3.5" />
                      Atualizar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => regenMutation.mutate(device.id)}
                    >
                      <RotateCcw className="size-3.5" />
                      Novo código
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => removeMutation.mutate(device.id)}
                    >
                      <Trash2 className="size-3.5" />
                      Remover
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}