import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { WidgetView } from "@/components/widgets/widget-view";
import {
  CURRENCY_OPTIONS,
  NEWS_FEEDS,
  WEATHER_CITIES,
  WIDGET_CATALOG,
  getWidgetDefinition,
  type WidgetConfig,
  type WidgetType,
} from "@/lib/widgets/catalog";
import { saveWidgetAsset } from "@/lib/widgets/widgets.functions";

/** Builds an information widget and drops it in the library like any content. */
export function WidgetComposer() {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveWidgetAsset);

  const [type, setType] = useState<WidgetType>("clock");
  const [name, setName] = useState("Relógio e data");
  const [config, setConfig] = useState<WidgetConfig>(getWidgetDefinition("clock").defaultConfig);

  function pickType(next: WidgetType) {
    const definition = getWidgetDefinition(next);
    setType(next);
    setConfig(definition.defaultConfig);
    setName(definition.label);
  }

  const saveMutation = useMutation({
    mutationFn: () => saveFn({ data: { name: name.trim(), config } }),
    onSuccess: async () => {
      toast.success("Widget adicionado à biblioteca. Já pode entrar em uma playlist.");
      await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
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
              Relógio, clima, cotações e notícias. Os dados vêm de fontes públicas e abertas, com
              crédito exibido automaticamente na tela quando a licença exige.
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
            <div className="max-w-sm space-y-2">
              <Label>Cidade</Label>
              <Select
                value={config.cityId}
                onValueChange={(value) => setConfig({ ...config, cityId: value })}
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
            </div>
          ) : null}

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
            ) : (
              <Plus className="size-4" />
            )}
            Adicionar à biblioteca
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Prévia</Label>
          <div className="aspect-video overflow-hidden rounded-xl border border-border">
            <div className="size-full [&_*]:!text-[inherit]">
              <WidgetView config={config} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Na TV o widget ocupa a tela inteira e atualiza os dados sozinho a cada 5 minutos.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}