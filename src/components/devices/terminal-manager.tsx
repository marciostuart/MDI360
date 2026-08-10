import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2, MonitorSmartphone, Trash2 } from "lucide-react";
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
  deleteDevice,
  linkDevice,
  listDevices,
  setDevicePlaylist,
  updateDevice,
} from "@/lib/devices/devices.functions";
import { DEFAULT_CANVAS_PRESET } from "@/lib/media/presets";
import { listPlaylists } from "@/lib/playlists/playlists.functions";

const MODES = [
  ["display", "Exibir mídias", "Reproduz playlists e recebe chamadas sobre as mídias."],
  ["issuer", "Emitir senhas", "Emite e imprime senhas pelos botões ou teclas configuradas."],
  ["caller", "Chamar senhas", "Permite chamar a próxima senha pelo próprio terminal."],
] as const;

function formatLastSeen(iso: string | null) {
  if (!iso) return "nunca conectou";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `há ${hours} h` : `há ${Math.floor(hours / 24)} dias`;
}

export function TerminalManager() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listDevices);
  const playlistsFn = useServerFn(listPlaylists);
  const linkFn = useServerFn(linkDevice);
  const updateFn = useServerFn(updateDevice);
  const playlistFn = useServerFn(setDevicePlaylist);
  const deleteFn = useServerFn(deleteDevice);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [initialModes, setInitialModes] = useState<string[]>(["display", "issuer"]);

  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: () => listFn({}),
    refetchInterval: 30_000,
  });
  const playlists = useQuery({ queryKey: ["playlists"], queryFn: () => playlistsFn({}) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["devices"] });

  const linkMutation = useMutation({
    mutationFn: () =>
      linkFn({
        data: {
          code,
          name,
          canvasPreset: DEFAULT_CANVAS_PRESET.id,
          deviceClass: "terminal",
          enabledModes: initialModes as ("display" | "issuer" | "caller")[],
        },
      }),
    onSuccess: async () => {
      setCode("");
      setName("");
      toast.success("Terminal Android vinculado. As funções escolhidas já estão ativas.");
      await refresh();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível vincular o terminal."),
  });

  const modesMutation = useMutation({
    mutationFn: (vars: { deviceId: string; enabledModes: string[] }) => updateFn({ data: vars }),
    onSuccess: async () => {
      toast.success("Funções atualizadas no terminal.");
      await refresh();
    },
    onError: () => toast.error("Não foi possível atualizar as funções."),
  });

  const playlistMutation = useMutation({
    mutationFn: (vars: { deviceId: string; playlistId: string | null }) =>
      playlistFn({ data: vars }),
    onSuccess: refresh,
    onError: () => toast.error("Não foi possível definir a playlist."),
  });

  const removeMutation = useMutation({
    mutationFn: (deviceId: string) => deleteFn({ data: { deviceId } }),
    onSuccess: async () => {
      toast.success("Terminal desvinculado. Ele exibirá um novo código.");
      await refresh();
    },
    onError: () => toast.error("Não foi possível desvincular o terminal."),
  });

  const terminals = (devices.data?.items ?? []).filter((device) =>
    device.appVersion?.toLowerCase().startsWith("android"),
  );
  const playlistItems = playlists.data?.items ?? [];

  const toggleInitialMode = (mode: string, checked: boolean) => {
    const next = new Set(initialModes);
    if (checked) next.add(mode);
    else next.delete(mode);
    if (next.size === 0) {
      toast.error("Selecione pelo menos uma função.");
      return;
    }
    setInitialModes(Array.from(next));
  };

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Terminais</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre o aplicativo Android uma única vez e escolha todas as funções do aparelho. Roku e
          navegador continuam sendo administrados em Telas.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="terminal-code">Código do aplicativo</Label>
              <Input
                id="terminal-code"
                value={code}
                onChange={(event) =>
                  setCode(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 6),
                  )
                }
                placeholder="ABC123"
                maxLength={6}
                className="font-display tracking-[0.3em] uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="terminal-name">Nome do terminal</Label>
              <Input
                id="terminal-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Totem da recepção"
                maxLength={120}
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {MODES.map(([mode, label, description]) => (
              <div
                key={mode}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <Switch
                  checked={initialModes.includes(mode)}
                  onCheckedChange={(checked) => toggleInitialMode(mode, checked)}
                />
              </div>
            ))}
          </div>
          <Button
            onClick={() => linkMutation.mutate()}
            disabled={code.length !== 6 || !name.trim() || linkMutation.isPending}
          >
            {linkMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Link2 className="size-4" />
            )}
            Vincular terminal
          </Button>
        </CardContent>
      </Card>

      {devices.isPending ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : terminals.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center gap-2 py-16 text-center">
            <MonitorSmartphone className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">Nenhum terminal Android vinculado</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Abra o aplicativo Android híbrido e informe acima o único código de seis caracteres.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {terminals.map((terminal) => (
            <Card key={terminal.id}>
              <CardContent className="space-y-5 pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{terminal.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {terminal.appVersion ?? "Android"} · visto{" "}
                      {formatLastSeen(terminal.lastSeenAt)}
                    </p>
                  </div>
                  <Badge variant={terminal.online ? "default" : "secondary"}>
                    {terminal.online ? "online" : "offline"}
                  </Badge>
                </div>

                <div className="space-y-3 rounded-lg border border-lime-500/30 bg-lime-500/5 p-4">
                  <p className="text-sm font-medium">Funções habilitadas</p>
                  {MODES.map(([mode, label, description]) => (
                    <div key={mode} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm">{label}</p>
                        <p className="text-xs text-muted-foreground">{description}</p>
                      </div>
                      <Switch
                        checked={terminal.enabledModes.includes(mode)}
                        disabled={modesMutation.isPending}
                        onCheckedChange={(checked) => {
                          const next = new Set(terminal.enabledModes);
                          if (checked) next.add(mode);
                          else next.delete(mode);
                          if (next.size === 0) {
                            toast.error("O terminal precisa ter pelo menos uma função.");
                            return;
                          }
                          modesMutation.mutate({
                            deviceId: terminal.id,
                            enabledModes: Array.from(next),
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>

                {terminal.enabledModes.includes("display") ? (
                  <div className="space-y-2">
                    <Label>Playlist padrão</Label>
                    <Select
                      value={terminal.defaultPlaylistId ?? "none"}
                      onValueChange={(value) =>
                        playlistMutation.mutate({
                          deviceId: terminal.id,
                          playlistId: value === "none" ? null : value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar playlist" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {playlistItems.map((playlist) => (
                          <SelectItem key={playlist.id} value={playlist.id}>
                            {playlist.name} · {playlist.itemCount} itens
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={removeMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Desvincular o terminal ${terminal.name}?`)) {
                        removeMutation.mutate(terminal.id);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                    Desvincular
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
