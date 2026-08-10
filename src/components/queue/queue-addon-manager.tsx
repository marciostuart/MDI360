import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Link2, Loader2, Settings2, Ticket, Trash2, Tv } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { PUBLIC_SITE_URL } from "@/lib/site-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  listQueueBackgroundImages,
  saveQueuePanel,
  setQueuePanelDevices,
  setQueuePanelEnabled,
  QUEUE_THEME_DEFAULTS,
  QUEUE_SOUND_DEFAULTS,
  KIOSK_THEME_DEFAULTS,
  clearQueueChime,
  type QueuePanelSummary,
} from "@/lib/queue/queue.functions";
import { QueuePanelConfig } from "@/components/queue/queue-panel-config";
import { DEFAULT_CANVAS_PRESET } from "@/lib/media/presets";
import { prepareUpload } from "@/lib/media/optimize-client";

function repairMojibake(value: string) {
  let result = value;
  for (let attempt = 0; attempt < 2 && /[ÃÂ]/.test(result); attempt += 1) {
    try {
      const bytes = Uint8Array.from(Array.from(result), (character) => character.charCodeAt(0));
      const decoded = new TextDecoder("utf-8").decode(bytes);
      if (decoded === result) break;
      result = decoded;
    } catch {
      break;
    }
  }
  return result;
}

/** Campo de cor com amostra + valor hexadecimal editável. */
function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{repairMojibake(label)}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
          aria-label={repairMojibake(label)}
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="font-mono uppercase"
          maxLength={7}
        />
      </div>
    </div>
  );
}

/**
 * Studio screen for the queue add-on. Enabling it on a TV creates a dedicated
 * operator login that only reaches the queue panel — never the content library.
 */
export function QueueAddonManager() {
  const contentRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const fetchPanels = useServerFn(listQueuePanels);
  const savePanel = useServerFn(saveQueuePanel);
  const togglePanel = useServerFn(setQueuePanelEnabled);
  const removePanel = useServerFn(deleteQueuePanel);
  const removeChime = useServerFn(clearQueueChime);
  const saveDevices = useServerFn(setQueuePanelDevices);

  const { data, isPending } = useQuery({
    queryKey: ["queue-panels"],
    queryFn: () => fetchPanels({}),
    refetchInterval: 20_000,
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    queueName: "",
    username: "",
    password: "",
    mode: "sequential",
    numberingScope: "sector",
    priorityPolicy: "priority",
    priorityPrefix: "",
    displaySeconds: 20,
    ...QUEUE_THEME_DEFAULTS,
    ...QUEUE_SOUND_DEFAULTS,
    ...KIOSK_THEME_DEFAULTS,
    printerFooterText: "",
  });

  const [uploadingChime, setUploadingChime] = useState<string | null>(null);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  /** Envia o MP3 do tom de chamada pelo proxy do servidor (sem CORS). */
  const uploadChime = async (deviceId: string, file: File) => {
    setUploadingChime(deviceId);
    try {
      const body = new FormData();
      body.append("deviceId", deviceId);
      body.append("file", file);
      const response = await fetch("/api/queue/chime", { method: "POST", body });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível enviar o tom.");
      toast.success("Tom de chamada atualizado.");
      await invalidate();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploadingChime(null);
    }
  };

  const clearChimeMutation = useMutation({
    mutationFn: (deviceId: string) => removeChime({ data: { deviceId } }),
    onSuccess: async () => {
      toast.success("Tom padrão restaurado.");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const fetchMedia = useServerFn(listQueueBackgroundImages);
  const { data: media } = useQuery({
    queryKey: ["queue-theme-images"],
    queryFn: () => fetchMedia({}),
    enabled: editing !== null,
  });
  const images = media?.items ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["queue-panels"] });

  const [uploadingKioskMedia, setUploadingKioskMedia] = useState<string | null>(null);

  const uploadKioskMedia = async (deviceId: string, slot: "logo" | "background", file: File) => {
    setUploadingKioskMedia(`${deviceId}:${slot}`);
    try {
      const prepared = await prepareUpload(file, DEFAULT_CANVAS_PRESET);
      if (prepared.kind !== "image") throw new Error("Selecione uma imagem.");
      const body = new FormData();
      body.append("deviceId", deviceId);
      body.append("slot", slot);
      body.append("file", prepared.blob, `${slot}.webp`);
      const response = await fetch("/api/queue/kiosk-media", { method: "POST", body });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "NÃ£o foi possÃ­vel enviar a imagem.");
      toast.success(
        slot === "logo" ? "Logo do emissor atualizada." : "Fundo do emissor atualizado.",
      );
      await invalidate();
    } catch (error) {
      toast.error(repairMojibake((error as Error).message));
    } finally {
      setUploadingKioskMedia(null);
    }
  };

  const removeKioskMedia = async (deviceId: string, slot: "logo" | "background") => {
    setUploadingKioskMedia(`${deviceId}:${slot}`);
    try {
      const response = await fetch("/api/queue/kiosk-media", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, slot }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "NÃ£o foi possÃ­vel remover a imagem.");
      toast.success("Imagem removida.");
      await invalidate();
    } catch (error) {
      toast.error(repairMojibake((error as Error).message));
    } finally {
      setUploadingKioskMedia(null);
    }
  };

  const saveMutation = useMutation({
    mutationFn: (input: {
      deviceId: string;
      queueName: string;
      username: string;
      password?: string;
      mode: "sequential" | "sector";
      numberingScope: "sector" | "global";
      priorityPolicy: "priority" | "alternate";
      priorityPrefix: string | null;
      displaySeconds: number;
      themeBgColor: string;
      themeBgMediaId: string | null;
      themeTicketColor: string;
      themeTextColor: string;
      themeHistoryColor: string;
      kioskBgColor: string;
      kioskBgMediaId: string | null;
      kioskCardColor: string;
      kioskTitleColor: string;
      kioskTextColor: string;
      kioskNormalButtonColor: string;
      kioskNormalButtonTextColor: string;
      kioskPriorityButtonColor: string;
      kioskPriorityButtonTextColor: string;
      kioskTitle: string | null;
      kioskShowLogo: boolean;
      kioskLogoHeight: number;
      printerFooterText: string | null;
      chimeVolume: number;
      voiceVolume: number;
    }) => savePanel({ data: input }),
    onSuccess: async () => {
      toast.success("Painel de senhas salvo.");
      setEditing(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível salvar."),
  });

  const devicesMutation = useMutation({
    mutationFn: (input: { panelId: string; deviceIds: string[] }) => saveDevices({ data: input }),
    onSuccess: async () => {
      toast.success("Terminais vinculados à fila.");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
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
    setSelectedDeviceIds(
      panel.linkedDevices.length > 0
        ? panel.linkedDevices.map((device) => device.id)
        : [panel.deviceId],
    );
    setForm({
      queueName: panel.queueName || panel.deviceName,
      username: panel.username ?? "",
      password: "",
      mode: panel.mode === "sector" ? "sector" : "sequential",
      numberingScope: panel.numberingScope === "global" ? "global" : "sector",
      priorityPolicy: panel.priorityPolicy === "alternate" ? "alternate" : "priority",
      priorityPrefix: panel.priorityPrefix ?? "",
      displaySeconds: panel.displaySeconds,
      themeBgColor: panel.themeBgColor || QUEUE_THEME_DEFAULTS.themeBgColor,
      themeBgMediaId: panel.themeBgMediaId ?? null,
      themeTicketColor: panel.themeTicketColor || QUEUE_THEME_DEFAULTS.themeTicketColor,
      themeTextColor: panel.themeTextColor || QUEUE_THEME_DEFAULTS.themeTextColor,
      themeHistoryColor: panel.themeHistoryColor || QUEUE_THEME_DEFAULTS.themeHistoryColor,
      kioskBgColor: panel.kioskBgColor || KIOSK_THEME_DEFAULTS.kioskBgColor,
      kioskBgMediaId: panel.kioskBgMediaId ?? null,
      kioskCardColor: panel.kioskCardColor || KIOSK_THEME_DEFAULTS.kioskCardColor,
      kioskTitleColor: panel.kioskTitleColor || KIOSK_THEME_DEFAULTS.kioskTitleColor,
      kioskTextColor: panel.kioskTextColor || KIOSK_THEME_DEFAULTS.kioskTextColor,
      kioskNormalButtonColor:
        panel.kioskNormalButtonColor || KIOSK_THEME_DEFAULTS.kioskNormalButtonColor,
      kioskNormalButtonTextColor:
        panel.kioskNormalButtonTextColor || KIOSK_THEME_DEFAULTS.kioskNormalButtonTextColor,
      kioskPriorityButtonColor:
        panel.kioskPriorityButtonColor || KIOSK_THEME_DEFAULTS.kioskPriorityButtonColor,
      kioskPriorityButtonTextColor:
        panel.kioskPriorityButtonTextColor || KIOSK_THEME_DEFAULTS.kioskPriorityButtonTextColor,
      kioskTitle: panel.kioskTitle ?? "",
      kioskShowLogo: panel.kioskShowLogo ?? true,
      kioskLogoHeight: panel.kioskLogoHeight ?? KIOSK_THEME_DEFAULTS.kioskLogoHeight,
      printerFooterText: panel.printerFooterText ?? "",
      chimeVolume: panel.chimeVolume ?? QUEUE_SOUND_DEFAULTS.chimeVolume,
      voiceVolume: panel.voiceVolume ?? QUEUE_SOUND_DEFAULTS.voiceVolume,
    });
  };

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node = walker.nextNode();
    while (node) {
      textNodes.push(node as Text);
      node = walker.nextNode();
    }
    for (const textNode of textNodes) {
      if (/[ÃÂ]/.test(textNode.nodeValue ?? "")) {
        textNode.nodeValue = repairMojibake(textNode.nodeValue ?? "");
      }
    }
  }, [data, editing, media, uploadingChime, uploadingKioskMedia]);

  if (isPending) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const panels = data?.items ?? [];

  if (data && data.configured && !data.available) {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-semibold">Sistema de senhas</h1>
          <p className="text-sm text-muted-foreground">
            Chamada de senhas com sinal sonoro e locução nas suas telas.
          </p>
        </header>

        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="size-4 text-primary" />
              Recurso disponível somente nos planos pagos
            </CardTitle>
            <CardDescription>
              Seu plano atual é o Gratuito (1 tela e 4 GB de armazenamento). Faça o upgrade para
              liberar o sistema de chamada de senhas, com painel exclusivo do operador, sinal sonoro
              e locução automática nas TVs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href={PUBLIC_SITE_URL} target="_blank" rel="noopener noreferrer">
                Falar com o time e fazer upgrade
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div ref={contentRef} className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">Sistema de senhas</h1>
        <p className="text-sm text-muted-foreground">
          Habilite a chamada de senhas por tela. Ao chamar, a TV interrompe a playlist, emite o
          sinal sonoro e anuncia a senha em voz alta — mesmo com o som da tela desativado.
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
            Nenhum terminal vinculado ainda. Vincule um aparelho em <strong>Terminais</strong> para
            habilitar o sistema de senhas.
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
                    <p className="font-medium">
                      {panel.panelId ? panel.queueName : `Nova fila em ${panel.deviceName}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {panel.panelId
                        ? `${panel.linkedDevices.length} terminal${panel.linkedDevices.length === 1 ? "" : "is"}`
                        : "Terminal disponível"}
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
                    {panel.panelId ? "Configurar fila" : "Criar fila"}
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

              {panel.panelId ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {panel.linkedDevices.map((device) => (
                      <Badge key={device.id} variant={device.online ? "default" : "secondary"}>
                        <Tv className="mr-1 size-3" /> {device.name}
                      </Badge>
                    ))}
                  </div>
                  <details className="rounded-lg border border-border p-4">
                    <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
                      <Ticket className="size-4 text-primary" /> Setores e operadores
                    </summary>
                    <div className="mt-4">
                      <QueuePanelConfig panelId={panel.panelId} />
                    </div>
                  </details>
                </>
              ) : null}

              {editing === panel.deviceId ? (
                <form
                  className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const username = form.username.trim().toLowerCase();
                    const password = form.password.trim();
                    if (username.length < 3) {
                      toast.error("O usuário do operador precisa de ao menos 3 caracteres.");
                      return;
                    }
                    if (!panel.panelId && password.length < 6) {
                      toast.error("Defina uma senha com ao menos 6 caracteres para o operador.");
                      return;
                    }
                    if (password.length > 0 && password.length < 6) {
                      toast.error(
                        "A nova senha precisa de ao menos 6 caracteres (deixe o campo vazio para manter a atual).",
                      );
                      return;
                    }
                    saveMutation.mutate({
                      deviceId: panel.deviceId,
                      queueName: form.queueName.trim(),
                      username,
                      password: password || undefined,
                      mode: form.mode === "sector" ? "sector" : "sequential",
                      numberingScope: form.numberingScope === "global" ? "global" : "sector",
                      priorityPolicy:
                        form.priorityPolicy === "alternate" ? "alternate" : "priority",
                      priorityPrefix: form.priorityPrefix.trim() || null,
                      displaySeconds: form.displaySeconds,
                      themeBgColor: form.themeBgColor,
                      themeBgMediaId: form.themeBgMediaId,
                      themeTicketColor: form.themeTicketColor,
                      themeTextColor: form.themeTextColor,
                      themeHistoryColor: form.themeHistoryColor,
                      kioskBgColor: form.kioskBgColor,
                      kioskBgMediaId: form.kioskBgMediaId,
                      kioskCardColor: form.kioskCardColor,
                      kioskTitleColor: form.kioskTitleColor,
                      kioskTextColor: form.kioskTextColor,
                      kioskNormalButtonColor: form.kioskNormalButtonColor,
                      kioskNormalButtonTextColor: form.kioskNormalButtonTextColor,
                      kioskPriorityButtonColor: form.kioskPriorityButtonColor,
                      kioskPriorityButtonTextColor: form.kioskPriorityButtonTextColor,
                      kioskTitle: form.kioskTitle.trim() || null,
                      kioskShowLogo: form.kioskShowLogo,
                      kioskLogoHeight: form.kioskLogoHeight,
                      printerFooterText: form.printerFooterText.trim() || null,
                      chimeVolume: form.chimeVolume,
                      voiceVolume: form.voiceVolume,
                    });
                  }}
                >
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor={`queue-name-${panel.deviceId}`}>Nome da fila</Label>
                    <Input
                      id={`queue-name-${panel.deviceId}`}
                      value={form.queueName}
                      onChange={(event) =>
                        setForm((value) => ({ ...value, queueName: event.target.value }))
                      }
                      placeholder="Ex.: Recepção, Caixa ou Triagem"
                      minLength={2}
                      maxLength={80}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      A aparência da emissão e da chamada será aplicada globalmente a esta fila.
                    </p>
                  </div>

                  {panel.panelId ? (
                    <div className="space-y-3 rounded-lg border border-border p-4 sm:col-span-2">
                      <div className="flex items-center gap-2">
                        <Link2 className="size-4 text-primary" />
                        <p className="font-medium">Terminais vinculados</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Selecione os terminais que participam desta fila. As funções habilitadas em
                        cada terminal definem se ele exibe chamadas, emite ou chama senhas.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {(data?.devices ?? []).map((candidate) => {
                          const belongsHere = panel.linkedDevices.some(
                            (device) => device.id === candidate.id,
                          );
                          const belongsElsewhere = Boolean(candidate.queueId) && !belongsHere;
                          return (
                            <label
                              key={candidate.id}
                              className="flex items-center gap-2 rounded-md border border-border p-3 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={selectedDeviceIds.includes(candidate.id)}
                                disabled={belongsElsewhere}
                                onChange={(event) =>
                                  setSelectedDeviceIds((current) =>
                                    event.target.checked
                                      ? [...new Set([...current, candidate.id])]
                                      : current.filter((id) => id !== candidate.id),
                                  )
                                }
                              />
                              {candidate.name}
                              {belongsElsewhere ? " · em outra fila" : ""}
                            </label>
                          );
                        })}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={devicesMutation.isPending || selectedDeviceIds.length === 0}
                        onClick={() =>
                          devicesMutation.mutate({
                            panelId: panel.panelId!,
                            deviceIds: selectedDeviceIds,
                          })
                        }
                      >
                        {devicesMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Link2 className="size-4" />
                        )}
                        Salvar terminais
                      </Button>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Settings2 className="size-4 text-primary" />
                    <p className="font-medium">Configuração da fila</p>
                  </div>
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
                      Senha {panel.panelId ? "(deixe vazio para manter)" : "(mínimo 6 caracteres)"}
                    </Label>
                    <Input
                      id={`pass-${panel.deviceId}`}
                      type="password"
                      value={form.password}
                      autoComplete="new-password"
                      minLength={6}
                      required={!panel.panelId}
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
                  {form.mode === "sector" ? (
                    <div className="space-y-1.5">
                      <Label>Numeração das senhas</Label>
                      <Select
                        value={form.numberingScope}
                        onValueChange={(value) =>
                          setForm((prev) => ({ ...prev, numberingScope: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sector">Sequência por setor</SelectItem>
                          <SelectItem value="global">Sequência global (única)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Global: se um setor chama a 001, o próximo setor chama a 002. O nome do
                        setor aparece junto do número na TV.
                      </p>
                    </div>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label>Atendimento preferencial</Label>
                    <Select
                      value={form.priorityPolicy}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, priorityPolicy: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="priority">Prioritário (fura a fila)</SelectItem>
                        <SelectItem value="alternate">
                          Intercalado (1 preferencial, 1 normal)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`pprefix-${panel.deviceId}`}>
                      Prefixo das preferenciais (opcional)
                    </Label>
                    <Input
                      id={`pprefix-${panel.deviceId}`}
                      value={form.priorityPrefix}
                      maxLength={3}
                      placeholder="P"
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          priorityPrefix: event.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`secs-${panel.deviceId}`}>Tempo na tela (segundos)</Label>
                    <Input
                      id={`secs-${panel.deviceId}`}
                      type="number"
                      min={10}
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
                    <div className="w-full space-y-3 rounded-lg border border-border p-4">
                      <p className="text-sm font-medium">Som da chamada</p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`chimevol-${panel.deviceId}`}>
                            Volume do tom de chamada ({form.chimeVolume}%)
                          </Label>
                          <input
                            id={`chimevol-${panel.deviceId}`}
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={form.chimeVolume}
                            onChange={(event) =>
                              setForm((prev) => ({
                                ...prev,
                                chimeVolume: Number(event.target.value),
                              }))
                            }
                            className="w-full accent-primary"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`voicevol-${panel.deviceId}`}>
                            Volume da locução ({form.voiceVolume}%)
                          </Label>
                          <input
                            id={`voicevol-${panel.deviceId}`}
                            type="range"
                            min={50}
                            max={300}
                            step={10}
                            value={form.voiceVolume}
                            onChange={(event) =>
                              setForm((prev) => ({
                                ...prev,
                                voiceVolume: Number(event.target.value),
                              }))
                            }
                            className="w-full accent-primary"
                          />
                          <p className="text-xs text-muted-foreground">
                            Acima de 100% a fala é amplificada, ficando mais alta que o tom.
                          </p>
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label htmlFor={`chime-${panel.deviceId}`}>
                            Tom de chamada personalizado (.mp3, até 2 MB)
                          </Label>
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              id={`chime-${panel.deviceId}`}
                              type="file"
                              accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,.mp3,.wav,.ogg"
                              disabled={uploadingChime === panel.deviceId}
                              className="max-w-xs"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                if (file) void uploadChime(panel.deviceId, file);
                              }}
                            />
                            {uploadingChime === panel.deviceId ? (
                              <Loader2 className="size-4 animate-spin text-muted-foreground" />
                            ) : null}
                            {panel.chimeName ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => clearChimeMutation.mutate(panel.deviceId)}
                              >
                                Usar tom padrão
                              </Button>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {panel.chimeName
                              ? `Tom atual: ${panel.chimeName}`
                              : "Tom atual: bitonal padrão do sistema."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 sm:col-span-2">
                    <div className="w-full space-y-3 rounded-lg border border-border p-4">
                      <p className="text-sm font-medium">Aparência da chamada na TV</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ColorField
                          id={`bg-${panel.deviceId}`}
                          label="Cor de fundo"
                          value={form.themeBgColor}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, themeBgColor: value }))
                          }
                        />
                        <ColorField
                          id={`ticket-${panel.deviceId}`}
                          label="Cor do número da senha"
                          value={form.themeTicketColor}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, themeTicketColor: value }))
                          }
                        />
                        <ColorField
                          id={`text-${panel.deviceId}`}
                          label='Cor dos textos ("Senha chamada" e setor)'
                          value={form.themeTextColor}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, themeTextColor: value }))
                          }
                        />
                        <ColorField
                          id={`hist-${panel.deviceId}`}
                          label="Cor das últimas chamadas"
                          value={form.themeHistoryColor}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, themeHistoryColor: value }))
                          }
                        />
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label>Imagem de fundo (opcional)</Label>
                          <Select
                            value={form.themeBgMediaId ?? "none"}
                            onValueChange={(value) =>
                              setForm((prev) => ({
                                ...prev,
                                themeBgMediaId: value === "none" ? null : value,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Somente cor de fundo" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Somente cor de fundo</SelectItem>
                              {!media ? (
                                <SelectItem value="loading" disabled>
                                  Carregando imagens...
                                </SelectItem>
                              ) : images.length === 0 ? (
                                <SelectItem value="empty" disabled>
                                  Nenhuma imagem pronta na biblioteca
                                </SelectItem>
                              ) : null}
                              {images.map((image) => (
                                <SelectItem key={image.id} value={image.id}>
                                  {image.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Use uma imagem já enviada na sua biblioteca de arquivos. Ela cobre toda
                            a tela durante a chamada.
                          </p>
                        </div>
                      </div>

                      <div
                        className="relative aspect-video grid place-items-center overflow-hidden rounded-md bg-cover bg-center p-6 text-center"
                        style={{
                          backgroundColor: form.themeBgColor,
                          ...(form.themeBgMediaId
                            ? {
                                backgroundImage: `url(${JSON.stringify(
                                  images.find((i) => i.id === form.themeBgMediaId)?.previewUrl ??
                                    "",
                                )})`,
                              }
                            : {}),
                        }}
                      >
                        <div>
                          <p
                            className="text-[10px] font-semibold uppercase tracking-[0.35em]"
                            style={{ color: form.themeTextColor }}
                          >
                            Senha chamada
                          </p>
                          <p
                            className="text-4xl font-black leading-none"
                            style={{ color: form.themeTicketColor }}
                          >
                            A012
                          </p>
                          <p
                            className="mt-1 text-sm font-bold uppercase"
                            style={{ color: form.themeTextColor }}
                          >
                            Guichê 2
                          </p>
                          <p
                            className="mt-3 text-xs font-black"
                            style={{ color: form.themeHistoryColor }}
                          >
                            A011 - Caixa 2 A010 - Triagem
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 sm:col-span-2">
                    <div className="w-full space-y-3 rounded-lg border border-border p-4">
                      <p className="text-sm font-medium">Aparência da tela de emissão (totem)</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label htmlFor={`kiosk-title-${panel.deviceId}`}>
                            Título da tela (opcional)
                          </Label>
                          <Input
                            id={`kiosk-title-${panel.deviceId}`}
                            value={form.kioskTitle}
                            maxLength={60}
                            placeholder="Retire sua senha"
                            onChange={(event) =>
                              setForm((prev) => ({ ...prev, kioskTitle: event.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label htmlFor={`printer-footer-${panel.deviceId}`}>
                            {"Rodap\u00e9 do comprovante (opcional)"}
                          </Label>
                          <Textarea
                            id={`printer-footer-${panel.deviceId}`}
                            value={form.printerFooterText}
                            maxLength={240}
                            rows={3}
                            placeholder={"Ex.: Obrigado pela prefer\u00eancia\nAguarde ser chamado"}
                            onChange={(event) =>
                              setForm((prev) => ({
                                ...prev,
                                printerFooterText: event.target.value,
                              }))
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            {
                              "O texto ser\u00e1 impresso abaixo da data e hora. Use Enter para quebrar linhas."
                            }
                          </p>
                        </div>
                        <ColorField
                          id={`kbg-${panel.deviceId}`}
                          label="Cor de fundo"
                          value={form.kioskBgColor}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, kioskBgColor: value }))
                          }
                        />
                        <ColorField
                          id={`kcard-${panel.deviceId}`}
                          label="Cor do painel dos botões"
                          value={form.kioskCardColor}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, kioskCardColor: value }))
                          }
                        />
                        <ColorField
                          id={`ktitle-${panel.deviceId}`}
                          label="Cor do título e da senha emitida"
                          value={form.kioskTitleColor}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, kioskTitleColor: value }))
                          }
                        />
                        <ColorField
                          id={`ktext-${panel.deviceId}`}
                          label="Cor dos textos auxiliares"
                          value={form.kioskTextColor}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, kioskTextColor: value }))
                          }
                        />
                        <ColorField
                          id={`knbtn-${panel.deviceId}`}
                          label="Cor do botão Senha normal"
                          value={form.kioskNormalButtonColor}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, kioskNormalButtonColor: value }))
                          }
                        />
                        <ColorField
                          id={`knbtntx-${panel.deviceId}`}
                          label="Texto do botão Senha normal"
                          value={form.kioskNormalButtonTextColor}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, kioskNormalButtonTextColor: value }))
                          }
                        />
                        <ColorField
                          id={`kpbtn-${panel.deviceId}`}
                          label="Cor do botão Preferencial"
                          value={form.kioskPriorityButtonColor}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, kioskPriorityButtonColor: value }))
                          }
                        />
                        <ColorField
                          id={`kpbtntx-${panel.deviceId}`}
                          label="Texto do botão Preferencial"
                          value={form.kioskPriorityButtonTextColor}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, kioskPriorityButtonTextColor: value }))
                          }
                        />
                        <div className="space-y-1.5 sm:col-span-2 rounded-md border border-dashed border-border p-3">
                          <Label>Imagem de fundo exclusiva do emissor</Label>
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/avif"
                              disabled={uploadingKioskMedia === `${panel.deviceId}:background`}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) void uploadKioskMedia(panel.deviceId, "background", file);
                                event.currentTarget.value = "";
                              }}
                            />
                            {panel.hasKioskBgImage ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={uploadingKioskMedia === `${panel.deviceId}:background`}
                                onClick={() => void removeKioskMedia(panel.deviceId, "background")}
                              >
                                Remover
                              </Button>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {
                              "Esta imagem \u00e9 exclusiva deste emissor e ser\u00e1 convertida para WebP automaticamente."
                            }
                          </p>
                          {panel.kioskBgImagePreviewUrl ? (
                            <img
                              src={panel.kioskBgImagePreviewUrl}
                              alt="Fundo exclusivo do emissor"
                              className="aspect-video w-full rounded-md object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <Switch
                            id={`klogo-${panel.deviceId}`}
                            checked={form.kioskShowLogo}
                            onCheckedChange={(checked) =>
                              setForm((prev) => ({ ...prev, kioskShowLogo: checked }))
                            }
                          />
                          <Label htmlFor={`klogo-${panel.deviceId}`} className="text-sm">
                            Exibir a logo da empresa na tela de emissão
                          </Label>
                        </div>
                        {form.kioskShowLogo ? (
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label>Logo exclusiva do emissor</Label>
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/avif"
                                disabled={uploadingKioskMedia === `${panel.deviceId}:logo`}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (file) void uploadKioskMedia(panel.deviceId, "logo", file);
                                  event.currentTarget.value = "";
                                }}
                              />
                              {panel.hasKioskLogo ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={uploadingKioskMedia === `${panel.deviceId}:logo`}
                                  onClick={() => void removeKioskMedia(panel.deviceId, "logo")}
                                >
                                  Remover
                                </Button>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {
                                "Substitui a logo padr\u00e3o apenas neste emissor. A imagem \u00e9 otimizada para WebP."
                              }
                            </p>
                            {panel.kioskLogoPreviewUrl ? (
                              <img
                                src={panel.kioskLogoPreviewUrl}
                                alt="Logo exclusiva do emissor"
                                className="max-h-24 max-w-full rounded-md object-contain"
                              />
                            ) : null}
                            <Label htmlFor={`klogoh-${panel.deviceId}`}>
                              Tamanho da logo na tela · {form.kioskLogoHeight}px
                            </Label>
                            <input
                              id={`klogoh-${panel.deviceId}`}
                              type="range"
                              min={40}
                              max={400}
                              step={4}
                              value={form.kioskLogoHeight}
                              onChange={(event) =>
                                setForm((prev) => ({
                                  ...prev,
                                  kioskLogoHeight: Number(event.target.value),
                                }))
                              }
                              className="w-full accent-primary"
                            />
                          </div>
                        ) : null}
                      </div>

                      <div
                        className="relative grid aspect-video place-items-center overflow-hidden rounded-md bg-cover bg-center p-6 text-center"
                        style={{
                          backgroundColor: form.kioskBgColor,
                          ...(panel.kioskBgImagePreviewUrl || form.kioskBgMediaId
                            ? {
                                backgroundImage: `url(${JSON.stringify(
                                  panel.kioskBgImagePreviewUrl ??
                                    images.find((i) => i.id === form.kioskBgMediaId)?.previewUrl ??
                                    "",
                                )})`,
                              }
                            : {}),
                        }}
                      >
                        <div className="mx-auto flex w-[40%] min-w-[280px] flex-col justify-center gap-6">
                          {form.kioskShowLogo ? (
                            panel.kioskLogoPreviewUrl ? (
                              <img
                                src={panel.kioskLogoPreviewUrl}
                                alt="Logo do emissor"
                                className="mx-auto object-contain"
                                style={{ height: Math.round(form.kioskLogoHeight / 3) }}
                              />
                            ) : (
                              <div
                                className="mx-auto rounded bg-foreground/10"
                                style={{
                                  height: Math.round(form.kioskLogoHeight / 3),
                                  width: Math.round((form.kioskLogoHeight / 3) * 2.5),
                                }}
                              />
                            )
                          ) : null}
                          <p
                            className="text-3xl font-semibold"
                            style={{ color: form.kioskTitleColor }}
                          >
                            {form.kioskTitle.trim() || "Retire sua senha"}
                          </p>
                          <div
                            className="space-y-2 rounded-md p-3"
                            style={{ backgroundColor: form.kioskCardColor }}
                          >
                            <div className="grid gap-2 sm:grid-cols-2">
                              <span
                                className="h-24 rounded-md py-3 text-lg font-semibold"
                                style={{
                                  backgroundColor: form.kioskNormalButtonColor,
                                  color: form.kioskNormalButtonTextColor,
                                }}
                              >
                                Senha normal
                              </span>
                              <span
                                className="h-24 rounded-md py-3 text-lg font-semibold"
                                style={{
                                  backgroundColor: form.kioskPriorityButtonColor,
                                  color: form.kioskPriorityButtonTextColor,
                                }}
                              >
                                Preferencial
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
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
