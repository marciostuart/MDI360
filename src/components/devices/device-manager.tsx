import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Camera,
  Eraser,
  Link2,
  Loader2,
  MonitorSmartphone,
  Pencil,
  Power,
  Replace,
  RefreshCw,
  Ruler,
  Sparkles,
  Trash2,
  Tv,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useState } from "react";
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
  sendDeviceCommand,
  setDeviceAudio,
  setDeviceResolution,
  setDeviceTransition,
  setDevicePlaylist,
  updateDevice,
} from "@/lib/devices/devices.functions";
import { listPlaylists } from "@/lib/playlists/playlists.functions";
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
  const playlistsFn = useServerFn(listPlaylists);
  const setPlaylistFn = useServerFn(setDevicePlaylist);
  const setAudioFn = useServerFn(setDeviceAudio);
  const setTransitionFn = useServerFn(setDeviceTransition);
  const replaceFn = useServerFn(replaceDevice);
  const updateFn = useServerFn(updateDevice);
  const setResolutionFn = useServerFn(setDeviceResolution);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [presetId, setPresetId] = useState(DEFAULT_CANVAS_PRESET.id);
  const [replaceTarget, setReplaceTarget] = useState<{ id: string; name: string } | null>(null);
  const [replaceCode, setReplaceCode] = useState("");
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  /** Resolução em edição por tela (só é salva quando o cliente confirma). */
  const [resolutionDraft, setResolutionDraft] = useState<
    Record<string, { width: string; height: string }>
  >({});
  const [shotPreview, setShotPreview] = useState<
    { name: string; url: string; at: string | null } | null
  >(null);

  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: () => listFn({}),
    refetchInterval: 30_000,
  });

  const playlists = useQuery({
    queryKey: ["playlists"],
    queryFn: () => playlistsFn({}),
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
    mutationFn: (vars: {
      deviceId: string;
      kind: "reload" | "restart" | "screenshot" | "clear_cache" | "reboot";
    }) => commandFn({ data: vars }),
    onSuccess: (_data, vars) => {
      if (vars.kind === "screenshot") {
        toast.success("Captura solicitada. A imagem aparece aqui em alguns segundos.");
      } else if (vars.kind === "clear_cache") {
        toast.success("Limpeza enviada: a tela apaga os arquivos e baixa tudo de novo.");
      } else if (vars.kind === "reboot") {
        toast.success("Reinicialização enviada para o aparelho.");
      } else {
        toast.success("Comando enviado. A tela executa no próximo contato.");
      }
    },
    onError: () => toast.error("Não foi possível enviar o comando."),
  });

  const resolutionMutation = useMutation({
    mutationFn: (vars: {
      deviceId: string;
      screenWidth: number | null;
      screenHeight: number | null;
    }) => setResolutionFn({ data: vars }),
    onSuccess: async (_data, vars) => {
      toast.success(
        vars.screenWidth
          ? `Resolução definida em ${vars.screenWidth}×${vars.screenHeight}.`
          : "Resolução voltou ao tamanho real do painel.",
      );
      await refresh();
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível alterar a resolução desta tela.",
      ),
  });

  const renameMutation = useMutation({
    mutationFn: (vars: { deviceId: string; name: string }) => updateFn({ data: vars }),
    onSuccess: async () => {
      toast.success("Nome da tela atualizado.");
      setRenameTarget(null);
      setRenameValue("");
      await refresh();
    },
    onError: () => toast.error("Não foi possível renomear esta tela."),
  });

  const replaceMutation = useMutation({
    mutationFn: (vars: { deviceId: string; code: string }) => replaceFn({ data: vars }),
    onSuccess: async () => {
      toast.success(
        "Tela substituída: toda a programação foi transferida e o aparelho antigo apagou o cache.",
      );
      setReplaceTarget(null);
      setReplaceCode("");
      await refresh();
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível substituir esta tela.",
      ),
  });

  const playlistMutation = useMutation({
    mutationFn: (vars: { deviceId: string; playlistId: string | null }) =>
      setPlaylistFn({ data: vars }),
    onSuccess: async () => {
      toast.success("Playlist definida. A tela troca o conteúdo em instantes.");
      await refresh();
    },
    onError: () => toast.error("Não foi possível definir a playlist desta tela."),
  });

  const audioMutation = useMutation({
    mutationFn: (vars: { deviceId: string; audioEnabled: boolean }) => setAudioFn({ data: vars }),
    onSuccess: async (_data, vars) => {
      toast.success(
        vars.audioEnabled
          ? "Áudio liberado nesta tela."
          : "Áudio bloqueado: esta tela não reproduz som em nenhum vídeo.",
      );
      await refresh();
    },
    onError: () => toast.error("Não foi possível alterar o áudio desta tela."),
  });

  const transitionMutation = useMutation({
    mutationFn: (vars: { deviceId: string; transitionEffect: "none" | "fade" }) =>
      setTransitionFn({ data: vars }),
    onSuccess: async (_data, vars) => {
      toast.success(
        vars.transitionEffect === "fade"
          ? "Transição suave ativada nesta tela."
          : "Transição desativada: os arquivos trocam em corte seco.",
      );
      await refresh();
    },
    onError: () => toast.error("Não foi possível alterar a transição desta tela."),
  });

  const items = devices.data?.items ?? [];
  const playlistItems = playlists.data?.items ?? [];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Telas</h1>
        <p className="text-sm text-muted-foreground">
          Abra o aplicativo na TV, veja o código de ativação exibido nela e use o botão abaixo para
          vincular o aparelho à sua conta.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-end">
          <div className="space-y-2 md:w-44">
            <Label htmlFor="device-code">Código da TV</Label>
            <Input
              id="device-code"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
              }
              placeholder="ABC123"
              className="font-display tracking-[0.3em] uppercase"
              maxLength={6}
            />
          </div>
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
            onClick={() => linkMutation.mutate()}
            disabled={!name.trim() || code.length !== 6 || linkMutation.isPending}
          >
            {linkMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Link2 className="size-4" />
            )}
            Vincular tela
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
            <p className="text-sm font-medium">Nenhuma tela vinculada ainda</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Abra o aplicativo na TV (ou <span className="font-medium">/tela</span> no navegador do
              aparelho). Ele mostra um código de ativação — informe-o no campo acima.
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

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Tv className="size-4" />
                    Vinculada · visto {formatLastSeen(device.lastSeenAt)}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Playlist em exibição</Label>
                    <Select
                      value={device.defaultPlaylistId ?? "none"}
                      onValueChange={(value) =>
                        playlistMutation.mutate({
                          deviceId: device.id,
                          playlistId: value === "none" ? null : value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar playlist" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma (tela em espera)</SelectItem>
                        {playlistItems.map((playlist) => (
                          <SelectItem key={playlist.id} value={playlist.id}>
                            {playlist.name} · {playlist.itemCount} itens
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {playlistItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Crie uma playlist na aba Playlists para poder atribuí-la a esta tela.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      {device.audioEnabled ? (
                        <Volume2 className="size-4 text-muted-foreground" />
                      ) : (
                        <VolumeX className="size-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="text-sm font-medium">Áudio da TV</p>
                        <p className="text-xs text-muted-foreground">
                          {device.audioEnabled
                            ? "Vídeos marcados com som tocam com áudio."
                            : "Silêncio total — ignora o som de todos os vídeos."}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={device.audioEnabled}
                      onCheckedChange={(checked) =>
                        audioMutation.mutate({ deviceId: device.id, audioEnabled: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Transição suave</p>
                        <p className="text-xs text-muted-foreground">
                          {device.transitionEffect === "fade"
                            ? "Os arquivos trocam com fade entre um e outro."
                            : "Troca em corte seco, sem efeito."}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={device.transitionEffect === "fade"}
                      onCheckedChange={(checked) =>
                        transitionMutation.mutate({
                          deviceId: device.id,
                          transitionEffect: checked ? "fade" : "none",
                        })
                      }
                    />
                  </div>

                  <div className="space-y-3 rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      <Ruler className="size-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Resolução da tela</p>
                        <p className="text-xs text-muted-foreground">
                          Deixe em branco para usar o tamanho real do painel. Use valores
                          personalizados em telas fora do formato convencional (faixas de LED,
                          totens recortados).
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="w-24 space-y-1">
                        <Label className="text-xs text-muted-foreground">Largura</Label>
                        <Input
                          inputMode="numeric"
                          placeholder="auto"
                          value={
                            resolutionDraft[device.id]?.width ??
                            (device.screenWidth ? String(device.screenWidth) : "")
                          }
                          onChange={(event) =>
                            setResolutionDraft((current) => ({
                              ...current,
                              [device.id]: {
                                width: event.target.value.replace(/[^0-9]/g, "").slice(0, 4),
                                height:
                                  current[device.id]?.height ??
                                  (device.screenHeight ? String(device.screenHeight) : ""),
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-xs text-muted-foreground">Altura</Label>
                        <Input
                          inputMode="numeric"
                          placeholder="auto"
                          value={
                            resolutionDraft[device.id]?.height ??
                            (device.screenHeight ? String(device.screenHeight) : "")
                          }
                          onChange={(event) =>
                            setResolutionDraft((current) => ({
                              ...current,
                              [device.id]: {
                                width:
                                  current[device.id]?.width ??
                                  (device.screenWidth ? String(device.screenWidth) : ""),
                                height: event.target.value.replace(/[^0-9]/g, "").slice(0, 4),
                              },
                            }))
                          }
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resolutionMutation.isPending}
                        onClick={() => {
                          const draft = resolutionDraft[device.id];
                          const width = Number(
                            draft?.width ?? (device.screenWidth ? String(device.screenWidth) : ""),
                          );
                          const height = Number(
                            draft?.height ??
                              (device.screenHeight ? String(device.screenHeight) : ""),
                          );
                          const bothEmpty = !width && !height;
                          if (!bothEmpty && (width < 240 || height < 240)) {
                            toast.error("Informe largura e altura de no mínimo 240 pixels.");
                            return;
                          }
                          resolutionMutation.mutate({
                            deviceId: device.id,
                            screenWidth: bothEmpty ? null : width,
                            screenHeight: bothEmpty ? null : height,
                          });
                        }}
                      >
                        Salvar
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      <Camera className="size-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Monitoramento</p>
                        <p className="text-xs text-muted-foreground">
                          {device.screenshotAt
                            ? `Última captura ${formatLastSeen(device.screenshotAt)}.`
                            : "Nenhuma captura ainda. Disponível no aplicativo Android."}
                        </p>
                      </div>
                    </div>
                    {device.screenshotUrl ? (
                      <button
                        type="button"
                        className="block w-full overflow-hidden rounded-md border border-border"
                        onClick={() =>
                          setShotPreview({
                            name: device.name,
                            url: device.screenshotUrl!,
                            at: device.screenshotAt,
                          })
                        }
                      >
                        <img
                          src={device.screenshotUrl}
                          alt={`Captura da tela ${device.name}`}
                          loading="lazy"
                          className="aspect-video w-full bg-black object-contain"
                        />
                      </button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={device.status !== "active"}
                      onClick={() =>
                        commandMutation.mutate({ deviceId: device.id, kind: "screenshot" })
                      }
                    >
                      <Camera className="size-3.5" />
                      Capturar tela
                    </Button>
                  </div>

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
                      onClick={() => {
                        setRenameTarget({ id: device.id, name: device.name });
                        setRenameValue(device.name);
                      }}
                    >
                      <Pencil className="size-3.5" />
                      Renomear
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReplaceTarget({ id: device.id, name: device.name });
                        setReplaceCode("");
                      }}
                    >
                      <Replace className="size-3.5" />
                      Substituir
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={device.status !== "active"}
                      onClick={() =>
                        commandMutation.mutate({ deviceId: device.id, kind: "clear_cache" })
                      }
                    >
                      <Eraser className="size-3.5" />
                      Limpar cache
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={device.status !== "active"}
                      onClick={() =>
                        commandMutation.mutate({ deviceId: device.id, kind: "reboot" })
                      }
                    >
                      <Power className="size-3.5" />
                      Reiniciar aparelho
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

      <Dialog open={shotPreview !== null} onOpenChange={(open) => !open && setShotPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Captura de {shotPreview?.name}</DialogTitle>
            <DialogDescription>
              {shotPreview?.at
                ? `Imagem recebida ${formatLastSeen(shotPreview.at)}.`
                : "Imagem recebida do aparelho."}
            </DialogDescription>
          </DialogHeader>
          {shotPreview ? (
            <img
              src={shotPreview.url}
              alt={`Captura da tela ${shotPreview.name}`}
              className="w-full rounded-md border border-border bg-black object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={replaceTarget !== null}
        onOpenChange={(open) => {
          if (!open && !replaceMutation.isPending) {
            setReplaceTarget(null);
            setReplaceCode("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Substituir tela</DialogTitle>
            <DialogDescription>
              Informe o código de ativação exibido no novo aparelho. Toda a programação de{" "}
              <span className="font-medium">{replaceTarget?.name}</span> (playlist, agenda, áudio,
              transição, senhas e histórico) passa para a nova tela. A tela antiga é desvinculada,
              apaga o cache e volta a exibir um código livre para uso futuro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="replace-code">Código da nova TV</Label>
            <Input
              id="replace-code"
              value={replaceCode}
              onChange={(event) =>
                setReplaceCode(
                  event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6),
                )
              }
              placeholder="ABC123"
              className="font-display uppercase tracking-[0.3em]"
              maxLength={6}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setReplaceTarget(null)}
              disabled={replaceMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() =>
                replaceTarget &&
                replaceMutation.mutate({ deviceId: replaceTarget.id, code: replaceCode })
              }
              disabled={replaceCode.length !== 6 || replaceMutation.isPending}
            >
              {replaceMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Replace className="size-4" />
              )}
              Transferir programação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open && !renameMutation.isPending) {
            setRenameTarget(null);
            setRenameValue("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear tela</DialogTitle>
            <DialogDescription>
              Altere o nome de exibição desta tela. Isso não afeta a programação nem o vínculo do
              aparelho.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-device">Nome da tela</Label>
            <Input
              id="rename-device"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder="Ex.: Recepção — TV da entrada"
              maxLength={120}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  renameTarget &&
                  renameValue.trim() &&
                  !renameMutation.isPending
                ) {
                  renameMutation.mutate({ deviceId: renameTarget.id, name: renameValue.trim() });
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRenameTarget(null)}
              disabled={renameMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() =>
                renameTarget &&
                renameMutation.mutate({ deviceId: renameTarget.id, name: renameValue.trim() })
              }
              disabled={!renameValue.trim() || renameMutation.isPending}
            >
              {renameMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Pencil className="size-4" />
              )}
              Salvar nome
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}