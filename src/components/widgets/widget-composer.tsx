import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Loader2, MapPin, Plus, RotateCcw, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { WidgetView } from "@/components/widgets/widget-view";
import { WidgetLayoutEditor } from "@/components/widgets/widget-layout-editor";
import {
  CURRENCY_OPTIONS,
  NEWS_FEEDS,
  LOTTERY_LAYOUT_PRESETS,
  WEATHER_CITIES,
  WIDGET_CATALOG,
  WIDGET_THEME_DEFAULTS,
  getWidgetDefinition,
  getLotteryLayoutPreset,
  resolveLotteryWidgetLayout,
  resolveWidgetTheme,
  type BackgroundMode,
  type WidgetConfig,
  type WidgetLayout,
  type WidgetTheme,
  type WidgetType,
} from "@/lib/widgets/catalog";
import { saveWidgetAsset } from "@/lib/widgets/widgets.functions";
import { LOTTERY_GAMES, lotteryDurationMs, type LotteryGameId } from "@/lib/widgets/lottery";

const BACKGROUND_LABELS: { id: BackgroundMode; label: string; hint: string }[] = [
  {
    id: "scene",
    label: "Cenário animado",
    hint: "Sol, nuvens, chuva ou tempestade conforme o clima",
  },
  { id: "gradient", label: "Degradê", hint: "Duas cores livres" },
  { id: "solid", label: "Cor sólida", hint: "Fundo chapado" },
  { id: "image", label: "Imagem", hint: "URL pública (https) com zoom suave" },
];

export type WidgetDraft = { assetId: string; name: string; config: WidgetConfig };

/** Builds an information widget and drops it in the library like any content. */
export function WidgetComposer({
  editing,
  onCancelEditing,
  allowedTypes,
  onSave,
  managedByPlatform = false,
}: {
  editing?: WidgetDraft | null;
  onCancelEditing?: () => void;
  allowedTypes?: readonly WidgetType[];
  onSave?: (draft: { name: string; config: WidgetConfig }) => Promise<unknown>;
  managedByPlatform?: boolean;
} = {}) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveWidgetAsset);
  const { data: publicSources } = useQuery({
    queryKey: ["widget-public-sources"],
    queryFn: async () => {
      const response = await fetch("/api/public/widget-sources");
      if (!response.ok) throw new Error("sources");
      return (await response.json()) as {
        news: { id: string; label: string; credit: string }[];
      };
    },
    staleTime: 60_000,
  });
  const availableNewsFeeds = publicSources?.news?.length ? publicSources.news : NEWS_FEEDS;

  const [type, setType] = useState<WidgetType>("clock");
  const [name, setName] = useState("Relógio e data");
  const [config, setConfig] = useState<WidgetConfig>(getWidgetDefinition("clock").defaultConfig);
  const [cep, setCep] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [lotteryTemplateGameId, setLotteryTemplateGameId] = useState<LotteryGameId>("megasena");
  const availableTypes = WIDGET_CATALOG.filter(
    (entry) => !allowedTypes || allowedTypes.includes(entry.type),
  );

  /** Consulta o CEP e guarda a cidade mais próxima encontrada no provedor. */
  async function lookupCep() {
    if (config.type !== "weather") return;
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) {
      toast.error("Informe um CEP com 8 dígitos.");
      return;
    }
    setCepLoading(true);
    try {
      const response = await fetch(`/api/public/widget-data?type=cep&cep=${digits}`);
      const payload = (await response.json()) as {
        error?: string;
        cep?: string;
        label?: string;
        latitude?: number;
        longitude?: number;
      };
      if (!response.ok || !payload.label) {
        toast.error(payload.error ?? "Não foi possível consultar este CEP.");
        return;
      }
      setCep(payload.cep ?? cep);
      setConfig({
        ...config,
        cep: payload.cep,
        placeLabel: payload.label,
        latitude: payload.latitude,
        longitude: payload.longitude,
      });
      toast.success(`Clima de ${payload.label}.`);
    } catch {
      toast.error("Falha na consulta do CEP.");
    } finally {
      setCepLoading(false);
    }
  }

  // Loading an existing widget from the library turns this into an editor.
  useEffect(() => {
    if (!editing) return;
    setType(editing.config.type);
    setName(editing.name);
    setConfig(editing.config);
    setCep(editing.config.type === "weather" ? (editing.config.cep ?? "") : "");
    if (editing.config.type === "lottery" && editing.config.gameIds[0]) {
      setLotteryTemplateGameId(editing.config.gameIds[0]);
    }
  }, [editing]);

  useEffect(() => {
    if (config.type !== "lottery" || config.gameIds.includes(lotteryTemplateGameId)) return;
    if (config.gameIds[0]) setLotteryTemplateGameId(config.gameIds[0]);
  }, [config, lotteryTemplateGameId]);

  const theme: WidgetTheme = resolveWidgetTheme(config.theme);

  function patchTheme(patch: Partial<WidgetTheme>) {
    setConfig({ ...config, theme: { ...theme, ...patch } } as WidgetConfig);
  }

  function pickType(next: WidgetType) {
    const definition = getWidgetDefinition(next);
    setType(next);
    setConfig(definition.defaultConfig);
    setName(definition.label);
    if (definition.defaultConfig.type === "lottery" && definition.defaultConfig.gameIds[0]) {
      setLotteryTemplateGameId(definition.defaultConfig.gameIds[0]);
    }
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      onSave
        ? onSave({ name: name.trim(), config })
        : saveFn({
            data: { name: name.trim(), config, ...(editing ? { assetId: editing.assetId } : {}) },
          }),
    onSuccess: async () => {
      toast.success(
        managedByPlatform
          ? "Widget global atualizado para todos os clientes."
          : editing
            ? "Widget atualizado. As telas recebem a mudança na sequência."
            : "Widget adicionado à biblioteca. Já pode entrar em uma playlist.",
      );
      await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
      onCancelEditing?.();
    },
    onError: () => toast.error("Não foi possível salvar o widget."),
  });

  return (
    <Card>
      <CardContent className="grid gap-6 pt-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Widgets de informação</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Relógio, clima, cotações e notícias — com fundo, cores e animações personalizáveis. Os
              dados vêm de fontes públicas e abertas, com crédito exibido automaticamente na tela
              quando a licença exige.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo de widget</Label>
              <Select value={type} onValueChange={(value) => pickType(value as WidgetType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map((entry) => (
                    <SelectItem key={entry.type} value={entry.type}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {getWidgetDefinition(type).description}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="widget-name">Nome na biblioteca</Label>
              <Input
                id="widget-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Clima BH"
              />
            </div>
          </div>

          {config.type === "clock" ? (
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={config.showDate}
                  onCheckedChange={(checked) => setConfig({ ...config, showDate: checked })}
                />
                Mostrar a data
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={config.showSeconds}
                  onCheckedChange={(checked) => setConfig({ ...config, showSeconds: checked })}
                />
                Mostrar os segundos
              </label>
            </div>
          ) : null}

          {config.type === "weather" ? (
            <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Buscar por CEP</Label>
                <div className="flex gap-2">
                  <Input
                    value={cep}
                    inputMode="numeric"
                    placeholder="00000-000"
                    maxLength={9}
                    onChange={(event) => setCep(event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={cepLoading}
                    onClick={() => void lookupCep()}
                  >
                    {cepLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <MapPin className="size-4" />
                    )}
                    Buscar
                  </Button>
                </div>
                {config.placeLabel ? (
                  <p className="text-xs text-muted-foreground">
                    Exibindo o clima de <strong>{config.placeLabel}</strong>{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        setCep("");
                        setConfig({
                          ...config,
                          cep: undefined,
                          placeLabel: undefined,
                          latitude: undefined,
                          longitude: undefined,
                        });
                      }}
                    >
                      usar a lista
                    </button>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Informe o CEP e buscamos a cidade mais próxima no provedor de clima.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Ou escolha a cidade</Label>
                <Select
                  value={config.cityId}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      cityId: value,
                      cep: undefined,
                      placeLabel: undefined,
                      latitude: undefined,
                      longitude: undefined,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEATHER_CITIES.map((city) => (
                      <SelectItem key={city.id} value={city.id}>
                        {city.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Fundo do clima</Label>
                <Select
                  value={config.backgroundMode ?? "procedural"}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      backgroundMode: value as "procedural" | "interactiveVideo",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="procedural">Fundo animado padrão</SelectItem>
                    <SelectItem value="interactiveVideo">
                      Fundo Interativo (vídeos da Torre)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  No modo interativo, o vídeo é escolhido automaticamente conforme o clima e o
                  período do dia configurados pela Torre.
                </p>
              </div>
            </div>
          ) : null}

          {config.type === "currency" ? (
            <div className="space-y-2">
              <Label>
                {managedByPlatform ? "Cotações liberadas no Studio" : "Moedas exibidas"}
              </Label>
              <div className="flex flex-wrap gap-2">
                {CURRENCY_OPTIONS.map((option) => {
                  const active = config.pairs.includes(option.id);
                  return (
                    <Button
                      key={option.id}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() =>
                        setConfig({
                          ...config,
                          pairs: active
                            ? config.pairs.filter((pair) => pair !== option.id)
                            : [...config.pairs, option.id].slice(0, 5),
                        })
                      }
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Escolha de 1 a 5 moedas.</p>
            </div>
          ) : null}

          {config.type === "news" ? (
            <div className="grid max-w-xl gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Fonte</Label>
                <Select
                  value={config.feedId}
                  onValueChange={(value) => setConfig({ ...config, feedId: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableNewsFeeds.map((feed) => (
                      <SelectItem key={feed.id} value={feed.id}>
                        {feed.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="widget-headlines">Manchetes por exibição</Label>
                <Input
                  id="widget-headlines"
                  type="number"
                  min={1}
                  max={10}
                  value={config.headlines}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      headlines: Math.min(10, Math.max(1, Number(event.target.value) || 1)),
                    })
                  }
                />
              </div>

              <div className="sm:col-span-2 space-y-4 rounded-lg border border-border p-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={config.oneAtATime}
                    onCheckedChange={(checked) => setConfig({ ...config, oneAtATime: checked })}
                  />
                  Uma notícia por vez (leitura confortável na TV)
                </label>

                {config.oneAtATime ? (
                  <>
                    <div className="space-y-2">
                      <Label>Tempo de cada notícia: {config.rotateSeconds}s</Label>
                      <Slider
                        min={3}
                        max={30}
                        step={1}
                        value={[config.rotateSeconds]}
                        onValueChange={([value]) =>
                          setConfig({ ...config, rotateSeconds: value ?? 7 })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Deixe a duração do widget na playlist maior que manchetes × tempo para
                        exibir todas.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-6">
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={config.showSummary}
                          onCheckedChange={(checked) =>
                            setConfig({ ...config, showSummary: checked })
                          }
                        />
                        Mostrar resumo
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={config.showImage}
                          onCheckedChange={(checked) =>
                            setConfig({ ...config, showImage: checked })
                          }
                        />
                        Usar a foto da notícia como fundo
                      </label>
                    </div>
                    {config.showSummary ? (
                      <div className="space-y-2">
                        <Label htmlFor="widget-summary-length">
                          Tamanho máximo do resumo: {config.summaryMaxChars} caracteres
                        </Label>
                        <Slider
                          id="widget-summary-length"
                          min={60}
                          max={600}
                          step={20}
                          value={[config.summaryMaxChars]}
                          onValueChange={([value]) =>
                            setConfig({ ...config, summaryMaxChars: value ?? 240 })
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          O tamanho da fonte também pode ser ajustado no editor visual abaixo.
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {config.type === "lottery" ? (
            <div className="max-w-2xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Templates otimizados para TV</p>
                  <p className="text-xs text-muted-foreground">
                    Aplica formatos legíveis e específicos para todas as modalidades.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfig({ ...config, gameLayouts: LOTTERY_LAYOUT_PRESETS })}
                >
                  <RotateCcw className="size-4" />
                  Aplicar padrões em todas
                </Button>
              </div>
              <div className="space-y-2">
                <Label>
                  {managedByPlatform
                    ? "Modalidades liberadas e ordem padrão"
                    : "Modalidades e ordem de exibição"}
                </Label>
                <div className="space-y-2">
                  {[
                    ...config.gameIds.flatMap((id) => {
                      const game = LOTTERY_GAMES.find((entry) => entry.id === id);
                      return game ? [game] : [];
                    }),
                    ...LOTTERY_GAMES.filter((game) => !config.gameIds.includes(game.id)),
                  ].map((game) => {
                    const index = config.gameIds.indexOf(game.id);
                    const active = index >= 0;
                    return (
                      <div
                        key={game.id}
                        draggable={active}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/lottery-game", game.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(event) => {
                          if (active) event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const sourceId = event.dataTransfer.getData(
                            "text/lottery-game",
                          ) as LotteryGameId;
                          const from = config.gameIds.indexOf(sourceId);
                          if (!active || from < 0 || from === index) return;
                          const next = [...config.gameIds];
                          const [moved] = next.splice(from, 1);
                          next.splice(index, 0, moved!);
                          setConfig({ ...config, gameIds: next as LotteryGameId[] });
                        }}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                      >
                        <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                          <Switch
                            checked={active}
                            onCheckedChange={(checked) =>
                              setConfig({
                                ...config,
                                gameIds: checked
                                  ? [...config.gameIds, game.id]
                                  : config.gameIds.filter((id) => id !== game.id),
                              })
                            }
                          />
                          <span className="font-medium">{game.label}</span>
                          {active ? (
                            <span className="text-xs text-muted-foreground">{index + 1}ª</span>
                          ) : null}
                        </label>
                        {active ? (
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={index === 0}
                              aria-label={`Mover ${game.label} para cima`}
                              onClick={() => {
                                const next = [...config.gameIds];
                                [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                                setConfig({ ...config, gameIds: next as LotteryGameId[] });
                              }}
                            >
                              <ArrowUp className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={index === config.gameIds.length - 1}
                              aria-label={`Mover ${game.label} para baixo`}
                              onClick={() => {
                                const next = [...config.gameIds];
                                [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
                                setConfig({ ...config, gameIds: next as LotteryGameId[] });
                              }}
                            >
                              <ArrowDown className="size-4" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2 rounded-lg border border-border p-4">
                <Label>Tempo de cada resultado: {config.rotateSeconds}s</Label>
                <Slider
                  min={5}
                  max={30}
                  step={1}
                  value={[config.rotateSeconds]}
                  onValueChange={([value]) => setConfig({ ...config, rotateSeconds: value ?? 10 })}
                />
                <p className="text-sm font-medium">
                  {config.gameIds.length} resultados × {config.rotateSeconds} segundos ={" "}
                  {Math.round(lotteryDurationMs(config) / 1000)} segundos por ciclo
                </p>
                <p className="text-xs text-muted-foreground">
                  Essa duração será aplicada automaticamente às playlists e não poderá cortar o
                  ciclo.
                </p>
              </div>
              {config.gameIds.includes("federal") ? (
                <div className="space-y-2 rounded-lg border border-border p-4">
                  <div>
                    <Label>Formato da Loteria Federal</Label>
                    <p className="text-xs text-muted-foreground">
                      Compare os dois formatos na prévia selecionando o template da Federal abaixo.
                    </p>
                  </div>
                  <Select
                    value={config.federalStyle}
                    onValueChange={(value) =>
                      setConfig({
                        ...config,
                        federalStyle: value as "list" | "receipt",
                      })
                    }
                  >
                    <SelectTrigger className="max-w-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="list">Lista para TV — números grandes</SelectItem>
                      <SelectItem value="receipt">Comprovante visual — papel impresso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ---------- appearance, shared by every widget ---------- */}
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Aparência</h3>
                <p className="text-xs text-muted-foreground">
                  Fundo, cores e animações deste widget.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => patchTheme(WIDGET_THEME_DEFAULTS)}
              >
                <RotateCcw className="size-4" />
                Padrão
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Fundo</Label>
                <Select
                  value={theme.background}
                  onValueChange={(value) => patchTheme({ background: value as BackgroundMode })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BACKGROUND_LABELS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {BACKGROUND_LABELS.find((option) => option.id === theme.background)?.hint}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Cor de destaque</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    className="h-10 w-16 p-1"
                    value={theme.accentColor || "#38BDF8"}
                    onChange={(event) => patchTheme({ accentColor: event.target.value })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => patchTheme({ accentColor: "" })}
                  >
                    Usar cor da marca
                  </Button>
                </div>
              </div>

              {theme.background === "solid" ? (
                <div className="space-y-2">
                  <Label>Cor do fundo</Label>
                  <Input
                    type="color"
                    className="h-10 w-16 p-1"
                    value={theme.backgroundColor}
                    onChange={(event) => patchTheme({ backgroundColor: event.target.value })}
                  />
                </div>
              ) : null}

              {theme.background === "gradient" ? (
                <div className="space-y-2">
                  <Label>Degradê</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      className="h-10 w-16 p-1"
                      value={theme.gradientFrom}
                      onChange={(event) => patchTheme({ gradientFrom: event.target.value })}
                    />
                    <Input
                      type="color"
                      className="h-10 w-16 p-1"
                      value={theme.gradientTo}
                      onChange={(event) => patchTheme({ gradientTo: event.target.value })}
                    />
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>Cor do texto</Label>
                <Input
                  type="color"
                  className="h-10 w-16 p-1"
                  value={theme.textColor}
                  onChange={(event) => patchTheme({ textColor: event.target.value })}
                />
              </div>
            </div>

            {theme.background === "image" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="widget-bg">Imagem de fundo (URL https)</Label>
                  <Input
                    id="widget-bg"
                    value={theme.backgroundImageUrl}
                    onChange={(event) => patchTheme({ backgroundImageUrl: event.target.value })}
                    placeholder="https://.../fundo.jpg"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Escurecer a imagem: {theme.overlay}%</Label>
                  <Slider
                    min={0}
                    max={90}
                    step={5}
                    value={[theme.overlay]}
                    onValueChange={([value]) => patchTheme({ overlay: value ?? 45 })}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={theme.animations}
                  onCheckedChange={(checked) => patchTheme({ animations: checked })}
                />
                Animações
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={theme.kenBurns}
                  onCheckedChange={(checked) => patchTheme({ kenBurns: checked })}
                />
                Zoom suave na imagem
              </label>
            </div>
          </div>

          {/* ---------- free layout: drag & drop over a live preview ---------- */}
          {config.type === "lottery" ? (
            <div className="space-y-3">
              <div className="max-w-md space-y-2">
                <Label>Template da modalidade</Label>
                <Select
                  value={lotteryTemplateGameId}
                  onValueChange={(value) => setLotteryTemplateGameId(value as LotteryGameId)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {config.gameIds.map((gameId) => {
                      const game = LOTTERY_GAMES.find((entry) => entry.id === gameId);
                      return game ? (
                        <SelectItem key={game.id} value={game.id}>
                          {game.label}
                        </SelectItem>
                      ) : null;
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Cada modalidade possui seu próprio posicionamento e tamanho. As alterações feitas
                  aqui afetam somente o resultado selecionado.
                </p>
              </div>
              <WidgetLayoutEditor
                key={lotteryTemplateGameId}
                config={config}
                title={`Template — ${LOTTERY_GAMES.find((game) => game.id === lotteryTemplateGameId)?.label ?? lotteryTemplateGameId}`}
                layout={resolveLotteryWidgetLayout(
                  lotteryTemplateGameId,
                  config.gameLayouts,
                  config.layout,
                )}
                defaultLayout={getLotteryLayoutPreset(lotteryTemplateGameId)}
                previewConfig={{ ...config, gameIds: [lotteryTemplateGameId] }}
                onChange={(layout: WidgetLayout) =>
                  setConfig({
                    ...config,
                    gameLayouts: {
                      ...(config.gameLayouts ?? {}),
                      [lotteryTemplateGameId]: layout,
                    },
                  })
                }
              />
            </div>
          ) : (
            <WidgetLayoutEditor
              config={config}
              onChange={(layout: WidgetLayout) => setConfig({ ...config, layout } as WidgetConfig)}
            />
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={
                saveMutation.isPending ||
                name.trim().length === 0 ||
                (config.type === "currency" && config.pairs.length === 0) ||
                (config.type === "lottery" && config.gameIds.length === 0)
              }
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : editing ? (
                <Save className="size-4" />
              ) : (
                <Plus className="size-4" />
              )}
              {editing || managedByPlatform ? "Salvar alterações" : "Adicionar à biblioteca"}
            </Button>
            {editing ? (
              <Button type="button" variant="outline" onClick={() => onCancelEditing?.()}>
                <X className="size-4" />
                Cancelar edição
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Prévia</Label>
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-muted">
            <WidgetView config={config} />
          </div>
          <p className="text-xs text-muted-foreground">
            Na TV o widget ocupa a tela inteira e atualiza os dados sozinho a cada 5 minutos.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
