import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutGrid,
  Link2,
  List,
  Loader2,
  MonitorSmartphone,
  Replace,
  Settings2,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Switch } from "@/components/ui/switch";
import {
  deleteDevice,
  linkDevice,
  listDevices,
  replaceDevice,
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
  const replaceFn = useServerFn(replaceDevice);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [replaceTarget, setReplaceTarget] = useState<{ id: string; name: string } | null>(null);
  const [replaceCode, setReplaceCode] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  useEffect(() => {
    const saved = window.localStorage.getItem("mdi360:terminals-view");
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);

  const changeViewMode = (mode: "list" | "grid") => {
    setViewMode(mode);
    window.localStorage.setItem("mdi360:terminals-view", mode);
  };

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
          deviceClass: "universal",
        },
      }),
    onSuccess: async () => {
      setCode("");
      setName("");
      toast.success("Terminal vinculado para exibição de mídias.");
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

  const replaceMutation = useMutation({
    mutationFn: () => {
      if (!replaceTarget) throw new Error("Selecione o terminal.");
      return replaceFn({ data: { deviceId: replaceTarget.id, code: replaceCode } });
    },
    onSuccess: async () => {
      toast.success("Terminal substituído. Configurações e programação foram transferidas.");
      setReplaceTarget(null);
      setReplaceCode("");
      await refresh();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível substituir."),
  });

  const terminals = devices.data?.items ?? [];
  const playlistItems = playlists.data?.items ?? [];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Terminais</h1>
            <p className="text-sm text-muted-foreground">
              Vincule e administre todos os aparelhos em um só lugar: Android, Roku e navegador.
              Todo novo terminal começa pronto para exibir mídias.
            </p>
          </div>
          <div className="flex rounded-lg border bg-muted/30 p-1" aria-label="Modo de visualização">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              onClick={() => changeViewMode("list")}
              aria-pressed={viewMode === "list"}
            >
              <List className="size-4" />
              Lista
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              onClick={() => changeViewMode("grid")}
              aria-pressed={viewMode === "grid"}
            >
              <LayoutGrid className="size-4" />
              Cards
            </Button>
          </div>
        </div>
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
          <p className="text-xs text-muted-foreground">
            Após o vínculo, aparelhos Android também poderão emitir e chamar senhas. Roku e
            navegador permanecem dedicados à exibição de mídias.
          </p>
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
            <p className="text-sm font-medium">Nenhum terminal vinculado</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Abra o aplicativo Android, o canal Roku ou a página de exibição no navegador e informe
              acima o código de seis caracteres.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className={viewMode === "grid" ? "grid gap-4 xl:grid-cols-2" : "space-y-3"}>
          {terminals.map((terminal) => {
            const appVersion = terminal.appVersion?.toLowerCase() ?? "";
            const isAndroid = appVersion.startsWith("android");
            const platform = isAndroid
              ? "Android híbrido"
              : appVersion.startsWith("roku")
                ? "Roku"
                : appVersion.startsWith("web")
                  ? "Navegador Web"
                  : "Tela conectada";
            const playlist = playlistItems.find((item) => item.id === terminal.defaultPlaylistId);

            if (viewMode === "list") {
              return (
                <Card key={terminal.id}>
                  <CardContent className="flex flex-col gap-4 py-4 xl:flex-row xl:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
                        <MonitorSmartphone className="size-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{terminal.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {platform} · visto {formatLastSeen(terminal.lastSeenAt)}
                        </p>
                      </div>
                    </div>

                    <Badge className="w-fit" variant={terminal.online ? "default" : "secondary"}>
                      {terminal.online ? "online" : "offline"}
                    </Badge>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 xl:min-w-[390px]">
                      {(isAndroid ? MODES : MODES.slice(0, 1)).map(([mode, label]) => (
                        <div key={mode} className="flex items-center gap-2">
                          <Switch
                            checked={
                              mode === "display" && !isAndroid
                                ? true
                                : terminal.enabledModes.includes(mode)
                            }
                            disabled={!isAndroid || modesMutation.isPending}
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
                            aria-label={label}
                          />
                          <span className="text-xs">{label}</span>
                        </div>
                      ))}
                    </div>

                    <div className="min-w-0 xl:w-48">
                      <p className="text-[11px] text-muted-foreground">Playlist padrão</p>
                      <p className="truncate text-sm">{playlist?.name ?? "Nenhuma"}</p>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/studio/terminais/$deviceId" params={{ deviceId: terminal.id }}>
                          <Settings2 className="size-4" />
                          Configurar
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setReplaceTarget({ id: terminal.id, name: terminal.name });
                          setReplaceCode("");
                        }}
                      >
                        <Replace className="size-4" />
                        Substituir
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        aria-label={`Desvincular ${terminal.name}`}
                        disabled={removeMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Desvincular o terminal ${terminal.name}?`)) {
                            removeMutation.mutate(terminal.id);
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            return (
              <Card key={terminal.id}>
                <CardContent className="space-y-5 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{terminal.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {platform} · visto {formatLastSeen(terminal.lastSeenAt)}
                      </p>
                    </div>
                    <Badge variant={terminal.online ? "default" : "secondary"}>
                      {terminal.online ? "online" : "offline"}
                    </Badge>
                  </div>

                  <div className="space-y-3 rounded-lg border border-lime-500/30 bg-lime-500/5 p-4">
                    <p className="text-sm font-medium">Funções habilitadas</p>
                    {(isAndroid ? MODES : MODES.slice(0, 1)).map(([mode, label, description]) => (
                      <div key={mode} className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm">{label}</p>
                          <p className="text-xs text-muted-foreground">{description}</p>
                        </div>
                        <Switch
                          checked={
                            mode === "display" && !isAndroid
                              ? true
                              : terminal.enabledModes.includes(mode)
                          }
                          disabled={!isAndroid || modesMutation.isPending}
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
                    {!isAndroid ? (
                      <p className="text-xs text-muted-foreground">
                        Este tipo de terminal é dedicado à exibição de mídias.
                      </p>
                    ) : null}
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

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/studio/terminais/$deviceId" params={{ deviceId: terminal.id }}>
                        <Settings2 className="size-4" />
                        Configurar
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setReplaceTarget({ id: terminal.id, name: terminal.name });
                        setReplaceCode("");
                      }}
                    >
                      <Replace className="size-4" />
                      Substituir
                    </Button>
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
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(replaceTarget)}
        onOpenChange={(open) => {
          if (!open) setReplaceTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Substituir terminal</DialogTitle>
            <DialogDescription>
              Abra o aplicativo no novo aparelho e informe o código exibido. Todas as configurações
              de {replaceTarget?.name} serão transferidas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="replacement-code">Código do novo aparelho</Label>
            <Input
              id="replacement-code"
              value={replaceCode}
              onChange={(event) =>
                setReplaceCode(
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
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReplaceTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => replaceMutation.mutate()}
              disabled={replaceCode.length !== 6 || replaceMutation.isPending}
            >
              {replaceMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirmar substituição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
