import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { WidgetLayoutEditor } from "@/components/widgets/widget-layout-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MediaListItem } from "@/lib/media/media.functions";
import {
  CURRENCY_OPTIONS,
  NEWS_FEEDS,
  getLotteryLayoutPreset,
  resolveLotteryGameTheme,
  resolveLotteryWidgetLayout,
  resolveWidgetLayout,
  resolveWidgetTheme,
  type WidgetConfig,
  type WidgetLayout,
  type LotteryGameTheme,
  type LotteryGameThemes,
  type WidgetTheme,
} from "@/lib/widgets/catalog";
import { LOTTERY_GAMES, type LotteryGameId } from "@/lib/widgets/lottery";
import {
  fetchPlatformWidgetAvailability,
  savePlatformWidgetPreferences,
} from "@/lib/widgets/platform-widget-preferences.functions";

type NewsConfig = Extract<WidgetConfig, { type: "news" }>;

const defaultNewsSettings = {
  headlines: 5,
  oneAtATime: true,
  rotateSeconds: 7,
  showSummary: true,
  summaryMaxChars: 240,
  showImage: true,
  imageMode: "background" as const,
} satisfies Pick<
  NewsConfig,
  | "headlines"
  | "oneAtATime"
  | "rotateSeconds"
  | "showSummary"
  | "summaryMaxChars"
  | "showImage"
  | "imageMode"
>;

export function PlatformWidgetPreferences({
  item,
  onClose,
}: {
  item: MediaListItem;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(savePlatformWidgetPreferences);
  const availability = useQuery({
    queryKey: ["studio-platform-widget-availability"],
    queryFn: () => fetchPlatformWidgetAvailability(),
  });
  const sources = useQuery({
    queryKey: ["widget-public-sources"],
    queryFn: async () => {
      const response = await fetch("/api/public/widget-sources");
      if (!response.ok) throw new Error("sources");
      return (await response.json()) as { news: { id: string; label: string }[] };
    },
  });
  const [pairs, setPairs] = useState<Extract<WidgetConfig, { type: "currency" }>["pairs"]>([]);
  const [currencyLayout, setCurrencyLayout] = useState<WidgetLayout>();
  const [currencyTheme, setCurrencyTheme] = useState<WidgetTheme>(resolveWidgetTheme());
  const [gameIds, setGameIds] = useState<Extract<WidgetConfig, { type: "lottery" }>["gameIds"]>([]);
  const [lotteryRotateSeconds, setLotteryRotateSeconds] = useState(10);
  const [lotteryFederalStyle, setLotteryFederalStyle] = useState<"list" | "receipt">("list");
  const [lotteryGameLayouts, setLotteryGameLayouts] =
    useState<Extract<WidgetConfig, { type: "lottery" }>["gameLayouts"]>();
  const [lotteryGameThemes, setLotteryGameThemes] =
    useState<Extract<WidgetConfig, { type: "lottery" }>["gameThemes"]>();
  const [lotteryTemplateGameId, setLotteryTemplateGameId] = useState<LotteryGameId>("megasena");
  const [feedId, setFeedId] = useState("");
  const [newsSettings, setNewsSettings] = useState(defaultNewsSettings);
  const [newsLayout, setNewsLayout] = useState<WidgetLayout>();
  const [newsTheme, setNewsTheme] = useState<WidgetTheme>(resolveWidgetTheme());

  useEffect(() => {
    const config = item.widgetConfig;
    if (config?.type === "currency") {
      setPairs(config.pairs);
      setCurrencyLayout(config.layout);
      setCurrencyTheme(resolveWidgetTheme(config.theme));
    }
    if (config?.type === "lottery") {
      setGameIds(config.gameIds);
      setLotteryRotateSeconds(config.rotateSeconds);
      setLotteryFederalStyle(config.federalStyle);
      setLotteryGameLayouts(config.gameLayouts);
      setLotteryGameThemes(config.gameThemes);
      if (config.gameIds[0]) setLotteryTemplateGameId(config.gameIds[0]);
    }
    if (config?.type === "news") {
      setFeedId(config.feedId);
      setNewsLayout(config.layout);
      setNewsTheme(resolveWidgetTheme(config.theme));
      setNewsSettings({
        headlines: config.headlines,
        oneAtATime: config.oneAtATime,
        rotateSeconds: config.rotateSeconds,
        showSummary: config.showSummary,
        summaryMaxChars: config.summaryMaxChars,
        showImage: config.showImage,
        imageMode: config.imageMode ?? (config.showImage ? "background" : "hidden"),
      });
    }
  }, [item]);

  const save = useMutation({
    mutationFn: async () => {
      if (item.widgetType === "currency") {
        return saveFn({
          data: {
            type: "currency",
            assetId: item.id,
            pairs,
            layout: currencyLayout,
            theme: currencyTheme,
          },
        });
      }
      if (item.widgetType === "lottery") {
        return saveFn({
          data: {
            type: "lottery",
            assetId: item.id,
            gameIds,
            rotateSeconds: lotteryRotateSeconds,
            federalStyle: lotteryFederalStyle,
            gameLayouts: lotteryGameLayouts,
            gameThemes: lotteryGameThemes,
          },
        });
      }
      if (item.widgetType === "news") {
        if (!feedId) throw new Error("Selecione uma fonte de notícias.");
        return saveFn({
          data: {
            type: "news",
            assetId: item.id,
            feedId,
            ...newsSettings,
            theme: newsTheme,
            layout: newsLayout,
          },
        });
      }
      throw new Error("Widget inválido.");
    },
    onSuccess: async () => {
      toast.success("Conteúdo do widget atualizado.");
      await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar."),
  });

  if (availability.isPending || !availability.data) {
    return (
      <Card>
        <CardContent className="grid place-items-center py-10">
          <Loader2 className="size-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const publicNews = sources.data?.news?.length ? sources.data.news : NEWS_FEEDS;
  const builtInIds = new Set(NEWS_FEEDS.map((source) => source.id));
  const allowedNews = publicNews.filter(
    (source) => !builtInIds.has(source.id) || availability.data.newsFeedIds.includes(source.id),
  );
  const selectedLotteryTheme = resolveLotteryGameTheme(
    lotteryTemplateGameId,
    item.widgetConfig?.type === "lottery" ? item.widgetConfig.theme : null,
    lotteryGameThemes,
  );
  const patchLotteryTheme = (next: Partial<LotteryGameTheme>) => {
    setLotteryGameThemes((current) => ({
      ...(current ?? {}),
      [lotteryTemplateGameId]: { ...selectedLotteryTheme, ...next },
    }) as LotteryGameThemes);
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Personalizar {item.name}</h2>
            <p className="text-sm text-muted-foreground">
              Escolha as fontes e o formato mais adequado para o seu público. A Torre controla
              apenas os recursos liberados para a plataforma.
            </p>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {item.widgetType === "currency" ? (
          <div className="space-y-4">
            <Label>Cotações exibidas</Label>
            <div className="flex flex-wrap gap-2">
              {CURRENCY_OPTIONS.filter((option) =>
                availability.data.currencyPairs.includes(option.id),
              ).map((option) => {
                const selected = pairs.includes(option.id);
                return (
                  <Button
                    key={option.id}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    onClick={() =>
                      setPairs((current) =>
                        selected
                          ? current.length > 1
                            ? current.filter((id) => id !== option.id)
                            : current
                          : [...current, option.id],
                      )
                    }
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
            <div className="space-y-4 rounded-lg border border-border p-4">
              <p className="text-sm font-medium">Aparência do widget</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Fundo</Label>
                  <Select
                    value={currencyTheme.background}
                    onValueChange={(value) =>
                      setCurrencyTheme((current) => ({
                        ...current,
                        background: value as WidgetTheme["background"],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solid">Cor sólida</SelectItem>
                      <SelectItem value="gradient">Gradiente</SelectItem>
                      <SelectItem value="image">Imagem de fundo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cor dos textos</Label>
                  <Input
                    type="color"
                    value={currencyTheme.textColor}
                    onChange={(event) =>
                      setCurrencyTheme((current) => ({ ...current, textColor: event.target.value }))
                    }
                  />
                </div>
                {currencyTheme.background === "image" ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>URL HTTPS da imagem de fundo</Label>
                    <Input
                      placeholder="https://.../fundo.jpg"
                      value={currencyTheme.backgroundImageUrl}
                      onChange={(event) =>
                        setCurrencyTheme((current) => ({
                          ...current,
                          backgroundImageUrl: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}
                {currencyTheme.background === "solid" ? (
                  <div className="space-y-2">
                    <Label>Cor do fundo</Label>
                    <Input
                      type="color"
                      value={currencyTheme.backgroundColor}
                      onChange={(event) =>
                        setCurrencyTheme((current) => ({
                          ...current,
                          backgroundColor: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}
                {currencyTheme.background === "gradient" ? (
                  <>
                    <div className="space-y-2">
                      <Label>Início do gradiente</Label>
                      <Input
                        type="color"
                        value={currencyTheme.gradientFrom}
                        onChange={(event) =>
                          setCurrencyTheme((current) => ({
                            ...current,
                            gradientFrom: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fim do gradiente</Label>
                      <Input
                        type="color"
                        value={currencyTheme.gradientTo}
                        onChange={(event) =>
                          setCurrencyTheme((current) => ({
                            ...current,
                            gradientTo: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            {item.widgetConfig?.type === "currency" ? (
              <WidgetLayoutEditor
                config={item.widgetConfig}
                layout={currencyLayout}
                previewConfig={{
                  ...item.widgetConfig,
                  pairs,
                  layout: currencyLayout,
                  theme: currencyTheme,
                }}
                onChange={setCurrencyLayout}
                title="Posição e tamanho dos elementos"
              />
            ) : null}
          </div>
        ) : null}

        {item.widgetType === "lottery" ? (
          <div className="space-y-4">
            <Label>Resultados exibidos</Label>
            <div className="flex flex-wrap gap-2">
              {LOTTERY_GAMES.filter((game) =>
                availability.data.lotteryGameIds.includes(game.id),
              ).map((game) => {
                const selected = gameIds.includes(game.id);
                return (
                  <Button
                    key={game.id}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    onClick={() =>
                      setGameIds((current) =>
                        selected
                          ? current.length > 1
                            ? current.filter((id) => id !== game.id)
                            : current
                          : [...current, game.id],
                      )
                    }
                  >
                    {game.label}
                  </Button>
                );
              })}
            </div>
            <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tempo de cada resultado: {lotteryRotateSeconds}s</Label>
                <Slider
                  min={5}
                  max={30}
                  step={1}
                  value={[lotteryRotateSeconds]}
                  onValueChange={([value]) => setLotteryRotateSeconds(value ?? 10)}
                />
              </div>
              <div className="space-y-2">
                <Label>Formato da Loteria Federal</Label>
                <Select
                  value={lotteryFederalStyle}
                  onValueChange={(value) => setLotteryFederalStyle(value as "list" | "receipt")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="list">Lista para TV</SelectItem>
                    <SelectItem value="receipt">Comprovante visual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {gameIds.length ? (
              <div className="space-y-3">
                <Label>Template visual por modalidade</Label>
                <Select
                  value={lotteryTemplateGameId}
                  onValueChange={(value) => setLotteryTemplateGameId(value as LotteryGameId)}
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {gameIds.map((gameId) => {
                      const game = LOTTERY_GAMES.find((entry) => entry.id === gameId);
                      return game ? (
                        <SelectItem key={game.id} value={game.id}>
                          {game.label}
                        </SelectItem>
                      ) : null;
                    })}
                  </SelectContent>
                </Select>
                <div className="space-y-4 rounded-lg border border-border p-4">
                  <div>
                    <p className="text-sm font-medium">Cores e fundo desta modalidade</p>
                    <p className="text-xs text-muted-foreground">
                      Estas opções valem somente para {LOTTERY_GAMES.find((game) => game.id === lotteryTemplateGameId)?.label ?? "este resultado"}.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Fundo</Label>
                      <Select
                        value={selectedLotteryTheme.background}
                        onValueChange={(value) =>
                          patchLotteryTheme({ background: value as LotteryGameTheme["background"] })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="solid">Cor sólida</SelectItem>
                          <SelectItem value="gradient">Gradiente</SelectItem>
                          <SelectItem value="image">Imagem de fundo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Cor geral das fontes</Label>
                      <Input
                        type="color"
                        value={selectedLotteryTheme.textColor}
                        onChange={(event) => patchLotteryTheme({ textColor: event.target.value })}
                      />
                    </div>
                    {selectedLotteryTheme.background === "solid" ? (
                      <div className="space-y-2">
                        <Label>Cor do fundo</Label>
                        <Input
                          type="color"
                          value={selectedLotteryTheme.backgroundColor}
                          onChange={(event) =>
                            patchLotteryTheme({ backgroundColor: event.target.value })
                          }
                        />
                      </div>
                    ) : null}
                    {selectedLotteryTheme.background === "gradient" ? (
                      <>
                        <div className="space-y-2">
                          <Label>Início do gradiente</Label>
                          <Input
                            type="color"
                            value={selectedLotteryTheme.gradientFrom}
                            onChange={(event) =>
                              patchLotteryTheme({ gradientFrom: event.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Fim do gradiente</Label>
                          <Input
                            type="color"
                            value={selectedLotteryTheme.gradientTo}
                            onChange={(event) =>
                              patchLotteryTheme({ gradientTo: event.target.value })
                            }
                          />
                        </div>
                      </>
                    ) : null}
                    {selectedLotteryTheme.background === "image" ? (
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Imagem de fundo desta modalidade (URL HTTPS)</Label>
                        <Input
                          placeholder="https://.../fundo-mega-sena.jpg"
                          value={selectedLotteryTheme.backgroundImageUrl}
                          onChange={(event) =>
                            patchLotteryTheme({ backgroundImageUrl: event.target.value })
                          }
                        />
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <Label>Fundo das bolinhas</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="color"
                          className="h-10 w-16 cursor-pointer p-1"
                          value={selectedLotteryTheme.placeholderBackground || "#ffffff"}
                          disabled={!selectedLotteryTheme.placeholderBackground}
                          onChange={(event) =>
                            patchLotteryTheme({ placeholderBackground: event.target.value })
                          }
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            patchLotteryTheme({
                              placeholderBackground: selectedLotteryTheme.placeholderBackground
                                ? ""
                                : "#ffffff",
                            })
                          }
                        >
                          {selectedLotteryTheme.placeholderBackground ? "Transparente" : "Usar cor"}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Cor dos números</Label>
                      <Input
                        type="color"
                        value={selectedLotteryTheme.placeholderTextColor}
                        onChange={(event) =>
                          patchLotteryTheme({ placeholderTextColor: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Contorno das bolinhas</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="color"
                          className="h-10 w-16 cursor-pointer p-1"
                          value={selectedLotteryTheme.placeholderBorderColor || "#ffffff"}
                          disabled={!selectedLotteryTheme.placeholderBorderColor}
                          onChange={(event) =>
                            patchLotteryTheme({ placeholderBorderColor: event.target.value })
                          }
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            patchLotteryTheme({
                              placeholderBorderColor: selectedLotteryTheme.placeholderBorderColor
                                ? ""
                                : "#ffffff",
                            })
                          }
                        >
                          {selectedLotteryTheme.placeholderBorderColor ? "Sem contorno" : "Usar contorno"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                {item.widgetConfig?.type === "lottery" ? (
                  <WidgetLayoutEditor
                    key={lotteryTemplateGameId}
                    config={item.widgetConfig}
                    layout={resolveLotteryWidgetLayout(
                      lotteryTemplateGameId,
                      lotteryGameLayouts,
                      item.widgetConfig.layout,
                    )}
                    defaultLayout={getLotteryLayoutPreset(lotteryTemplateGameId)}
                    previewConfig={{
                      ...item.widgetConfig,
                      gameIds: [lotteryTemplateGameId],
                      gameLayouts: {
                        ...(lotteryGameLayouts ?? {}),
                        [lotteryTemplateGameId]: resolveLotteryWidgetLayout(
                          lotteryTemplateGameId,
                          lotteryGameLayouts,
                          item.widgetConfig.layout,
                        ),
                      },
                      gameThemes: {
                        ...(lotteryGameThemes ?? {}),
                        [lotteryTemplateGameId]: selectedLotteryTheme,
                      },
                    }}
                    onChange={(layout: WidgetLayout) =>
                      setLotteryGameLayouts((current) => ({
                        ...(current ?? {}),
                        [lotteryTemplateGameId]: layout,
                      }))
                    }
                    title="Layout único para cada resultado desta modalidade"
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {item.widgetType === "news" ? (
          <div className="max-w-2xl space-y-4">
            <div className="space-y-2">
              <Label>Fonte de notícias</Label>
              <Select value={feedId} onValueChange={setFeedId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a fonte" />
                </SelectTrigger>
                <SelectContent>
                  {allowedNews.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Fontes RSS próprias cadastradas em “Fontes RSS da empresa” aparecem aqui junto com
                as fontes padrão liberadas.
              </p>
            </div>

            <div className="space-y-4 rounded-lg border border-border p-4">
              <p className="text-sm font-medium">Como a notícia aparece</p>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={newsSettings.oneAtATime}
                    onCheckedChange={(checked) =>
                      setNewsSettings((current) => ({ ...current, oneAtATime: checked }))
                    }
                  />
                  Uma notícia por vez
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={newsSettings.showSummary}
                    onCheckedChange={(checked) =>
                      setNewsSettings((current) => ({ ...current, showSummary: checked }))
                    }
                  />
                  Mostrar resumo
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={newsSettings.showImage}
                    onCheckedChange={(checked) =>
                      (() => {
                        const mode = checked ? newsSettings.imageMode : "hidden";
                        setNewsSettings((current) => ({
                          ...current,
                          showImage: checked,
                          imageMode: mode,
                        }));
                        setNewsLayout((current) => ({
                          ...resolveWidgetLayout("news", current),
                          image: {
                            ...resolveWidgetLayout("news", current).image!,
                            hidden: mode !== "block",
                          },
                        }));
                      })()
                    }
                  />
                  Exibir imagem
                </label>
              </div>
            </div>

            <div className="space-y-4 rounded-lg border border-border p-4">
              <p className="text-sm font-medium">Cores e fundo das notícias</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Fundo</Label>
                  <Select
                    value={newsTheme.background}
                    onValueChange={(value) =>
                      setNewsTheme((current) => ({
                        ...current,
                        background: value as WidgetTheme["background"],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solid">Cor sólida</SelectItem>
                      <SelectItem value="gradient">Gradiente</SelectItem>
                      <SelectItem value="image">Imagem de fundo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cor geral das fontes</Label>
                  <Input
                    type="color"
                    value={newsTheme.textColor}
                    onChange={(event) =>
                      setNewsTheme((current) => ({ ...current, textColor: event.target.value }))
                    }
                  />
                </div>
                {newsTheme.background === "solid" ? (
                  <div className="space-y-2">
                    <Label>Cor do fundo</Label>
                    <Input
                      type="color"
                      value={newsTheme.backgroundColor}
                      onChange={(event) =>
                        setNewsTheme((current) => ({
                          ...current,
                          backgroundColor: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}
                {newsTheme.background === "gradient" ? (
                  <>
                    <div className="space-y-2">
                      <Label>Início do gradiente</Label>
                      <Input
                        type="color"
                        value={newsTheme.gradientFrom}
                        onChange={(event) =>
                          setNewsTheme((current) => ({
                            ...current,
                            gradientFrom: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fim do gradiente</Label>
                      <Input
                        type="color"
                        value={newsTheme.gradientTo}
                        onChange={(event) =>
                          setNewsTheme((current) => ({ ...current, gradientTo: event.target.value }))
                        }
                      />
                    </div>
                  </>
                ) : null}
                {newsTheme.background === "image" ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Imagem de fundo das notícias (URL HTTPS)</Label>
                    <Input
                      placeholder="https://.../fundo-noticias.jpg"
                      value={newsTheme.backgroundImageUrl}
                      onChange={(event) =>
                        setNewsTheme((current) => ({
                          ...current,
                          backgroundImageUrl: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <details className="rounded-lg border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Ajustes avançados de rotação e resumo
              </summary>
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="managed-news-headlines">Manchetes por exibição</Label>
                    <Input
                      id="managed-news-headlines"
                      type="number"
                      min={1}
                      max={10}
                      value={newsSettings.headlines}
                      onChange={(event) =>
                        setNewsSettings((current) => ({
                          ...current,
                          headlines: Math.min(10, Math.max(1, Number(event.target.value) || 1)),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tempo de cada notícia: {newsSettings.rotateSeconds}s</Label>
                    <Slider
                      min={3}
                      max={30}
                      step={1}
                      value={[newsSettings.rotateSeconds]}
                      onValueChange={([value]) =>
                        setNewsSettings((current) => ({
                          ...current,
                          rotateSeconds: value ?? 7,
                        }))
                      }
                    />
                  </div>
                </div>

                {newsSettings.showSummary ? (
                  <div className="space-y-2">
                    <Label>
                      Tamanho máximo do resumo: {newsSettings.summaryMaxChars} caracteres
                    </Label>
                    <Slider
                      min={60}
                      max={600}
                      step={20}
                      value={[newsSettings.summaryMaxChars]}
                      onValueChange={([value]) =>
                        setNewsSettings((current) => ({
                          ...current,
                          summaryMaxChars: value ?? 240,
                        }))
                      }
                    />
                  </div>
                ) : null}
              </div>
            </details>

            <div className="space-y-2 rounded-lg border border-border p-4">
              <Label>Como posicionar a imagem</Label>
              <Select
                value={newsSettings.imageMode}
                onValueChange={(value) =>
                  (() => {
                    const mode = value as "background" | "block" | "hidden";
                    setNewsSettings((current) => ({
                      ...current,
                      imageMode: mode,
                      showImage: mode !== "hidden",
                    }));
                    setNewsLayout((current) => ({
                      ...resolveWidgetLayout("news", current),
                      image: {
                        ...resolveWidgetLayout("news", current).image!,
                        hidden: mode !== "block",
                      },
                    }));
                  })()
                }
              >
                <SelectTrigger className="max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="background">Imagem de fundo</SelectItem>
                  <SelectItem value="block">Imagem como bloco livre</SelectItem>
                  <SelectItem value="hidden">Não exibir imagem</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                No modo bloco, a imagem pode ser arrastada, redimensionada e alinhada abaixo.
              </p>
            </div>

            <WidgetLayoutEditor
              config={
                item.widgetConfig?.type === "news"
                  ? item.widgetConfig
                  : ({ type: "news", ...newsSettings, feedId } as WidgetConfig)
              }
              layout={newsLayout}
              previewConfig={
                item.widgetConfig?.type === "news"
                  ? {
                      ...item.widgetConfig,
                      ...newsSettings,
                      feedId,
                      theme: newsTheme,
                      layout: newsLayout,
                    }
                  : undefined
              }
              onChange={setNewsLayout}
              title="Layout único para todas as manchetes"
            />
          </div>
        ) : null}

        <Button
          onClick={() => save.mutate()}
          disabled={
            save.isPending ||
            (!pairs.length && item.widgetType === "currency") ||
            (!gameIds.length && item.widgetType === "lottery") ||
            (!feedId && item.widgetType === "news")
          }
        >
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Salvar personalização
        </Button>
      </CardContent>
    </Card>
  );
}
