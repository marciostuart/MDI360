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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MediaListItem } from "@/lib/media/media.functions";
import { CURRENCY_OPTIONS, NEWS_FEEDS, type WidgetConfig } from "@/lib/widgets/catalog";
import { LOTTERY_GAMES } from "@/lib/widgets/lottery";
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
} satisfies Pick<
  NewsConfig,
  "headlines" | "oneAtATime" | "rotateSeconds" | "showSummary" | "summaryMaxChars" | "showImage"
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
  const [gameIds, setGameIds] = useState<Extract<WidgetConfig, { type: "lottery" }>["gameIds"]>([]);
  const [feedId, setFeedId] = useState("");
  const [newsSettings, setNewsSettings] = useState(defaultNewsSettings);

  useEffect(() => {
    const config = item.widgetConfig;
    if (config?.type === "currency") setPairs(config.pairs);
    if (config?.type === "lottery") setGameIds(config.gameIds);
    if (config?.type === "news") {
      setFeedId(config.feedId);
      setNewsSettings({
        headlines: config.headlines,
        oneAtATime: config.oneAtATime,
        rotateSeconds: config.rotateSeconds,
        showSummary: config.showSummary,
        summaryMaxChars: config.summaryMaxChars,
        showImage: config.showImage,
      });
    }
  }, [item]);

  const save = useMutation({
    mutationFn: async () => {
      if (item.widgetType === "currency") {
        return saveFn({ data: { type: "currency", assetId: item.id, pairs } });
      }
      if (item.widgetType === "lottery") {
        return saveFn({ data: { type: "lottery", assetId: item.id, gameIds } });
      }
      if (item.widgetType === "news") {
        if (!feedId) throw new Error("Selecione uma fonte de notícias.");
        return saveFn({
          data: {
            type: "news",
            assetId: item.id,
            feedId,
            ...newsSettings,
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
    (source) =>
      !builtInIds.has(source.id) || availability.data.newsFeedIds.includes(source.id),
  );

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
          <div className="space-y-2">
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
          </div>
        ) : null}

        {item.widgetType === "lottery" ? (
          <div className="space-y-2">
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
                Fontes RSS próprias cadastradas em “Fontes RSS da empresa” aparecem aqui junto
                com as fontes padrão liberadas.
              </p>
            </div>

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

            <div className="space-y-4 rounded-lg border border-border p-4">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={newsSettings.oneAtATime}
                  onCheckedChange={(checked) =>
                    setNewsSettings((current) => ({ ...current, oneAtATime: checked }))
                  }
                />
                Uma notícia por vez
              </label>
              <div className="flex flex-wrap gap-6">
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
                      setNewsSettings((current) => ({ ...current, showImage: checked }))
                    }
                  />
                  Usar imagem como fundo
                </label>
              </div>
              {newsSettings.showSummary ? (
                <div className="space-y-2">
                  <Label>Tamanho máximo do resumo: {newsSettings.summaryMaxChars} caracteres</Label>
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