import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
  const [feedId, setFeedId] = useState<Extract<WidgetConfig, { type: "news" }>["feedId"] | "">("");

  useEffect(() => {
    const config = item.widgetConfig;
    if (config?.type === "currency") setPairs(config.pairs);
    if (config?.type === "lottery") setGameIds(config.gameIds);
    if (config?.type === "news") setFeedId(config.feedId);
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
        return saveFn({ data: { type: "news", assetId: item.id, feedId } });
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
  const allowedNews = publicNews.filter((source) =>
    availability.data.newsFeedIds.includes(source.id),
  );

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Conteúdo de {item.name}</h2>
            <p className="text-sm text-muted-foreground">
              Escolha o que faz sentido para seu negócio. Aparência e fontes disponíveis são
              administradas pela plataforma.
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
          <div className="max-w-xl space-y-2">
            <Label>Fonte de notícias</Label>
            <Select
              value={feedId}
              onValueChange={(value) =>
                setFeedId(value as Extract<WidgetConfig, { type: "news" }>["feedId"])
              }
            >
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
          Salvar seleção
        </Button>
      </CardContent>
    </Card>
  );
}
