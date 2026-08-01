import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, RotateCcw, Save, X } from "lucide-react";
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
  WEATHER_CITIES,
  WIDGET_CATALOG,
  WIDGET_THEME_DEFAULTS,
  getWidgetDefinition,
  resolveWidgetTheme,
  type BackgroundMode,
  type WidgetConfig,
  type WidgetLayout,
  type WidgetTheme,
  type WidgetType,
} from "@/lib/widgets/catalog";
import { saveWidgetAsset } from "@/lib/widgets/widgets.functions";

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
}: {
  editing?: WidgetDraft | null;
  onCancelEditing?: () => void;
} = {}) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveWidgetAsset);

  const [type, setType] = useState<WidgetType>("clock");
  const [name, setName] = useState("Relógio e data");
  const [config, setConfig] = useState<WidgetConfig>(getWidgetDefinition("clock").defaultConfig);

  // Loading an existing widget from the library turns this into an editor.
  useEffect(() => {
    if (!editing) return;
    setType(editing.config.type);
    setName(editing.name);
    setConfig(editing.config);
  }, [editing]);

  const theme: WidgetTheme = resolveWidgetTheme(config.theme);

  function patchTheme(patch: Partial<WidgetTheme>) {
    setConfig({ ...config, theme: { ...theme, ...patch } } as WidgetConfig);
  }

  function pickType(next: WidgetType) {
    const definition = getWidgetDefinition(next);
    setType(next);
    setConfig(definition.defaultConfig);
    setName(definition.label);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      saveFn({
        data: { name: name.trim(), config, ...(editing ? { assetId: editing.assetId } : {}) },
      }),
    onSuccess: async () => {
      toast.success(
        editing
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
                  {WIDGET_CATALOG.map((entry) => (
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
            </div>
          ) : null}

          {config.type === "currency" ? (
            <div className="space-y-2">
              <Label>Moedas exibidas</Label>
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
                    {NEWS_FEEDS.map((feed) => (
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
                  </>
                ) : null}
              </div>
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
          <WidgetLayoutEditor
            config={config}
            onChange={(layout: WidgetLayout) => setConfig({ ...config, layout } as WidgetConfig)}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={
                saveMutation.isPending ||
                name.trim().length === 0 ||
                (config.type === "currency" && config.pairs.length === 0)
              }
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : editing ? (
                <Save className="size-4" />
              ) : (
                <Plus className="size-4" />
              )}
              {editing ? "Salvar alterações" : "Adicionar à biblioteca"}
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
          <div className="aspect-video overflow-hidden rounded-xl border border-border">
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
