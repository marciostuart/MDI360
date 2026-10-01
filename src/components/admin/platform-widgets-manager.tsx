import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Power, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  fetchPlatformWidgetsAdmin,
  savePlatformWidgetAdmin,
} from "@/lib/admin/platform-widgets.functions";
import { NEWS_FEEDS } from "@/lib/widgets/catalog";
import { PLATFORM_WIDGET_TYPES, type PlatformWidgetType } from "@/lib/widgets/platform-widgets";

export function PlatformWidgetsManager() {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(savePlatformWidgetAdmin);
  const [newsFeedIds, setNewsFeedIds] = useState<string[]>([]);
  const query = useQuery({
    queryKey: ["admin-platform-widgets"],
    queryFn: () => fetchPlatformWidgetsAdmin(),
  });

  useEffect(() => {
    if (query.data) setNewsFeedIds(query.data.news.availableNewsFeedIds);
  }, [query.data]);

  const toggle = useMutation({
    mutationFn: async (type: PlatformWidgetType) => {
      const entry = query.data![type];
      return saveFn({
        data: {
          type,
          active: !entry.active,
          name: entry.name,
          config: entry.config,
          ...(type === "news" ? { availableNewsFeedIds: entry.availableNewsFeedIds } : {}),
        },
      });
    },
    onSuccess: async () => {
      toast.success("Disponibilidade do widget atualizada.");
      await queryClient.invalidateQueries({ queryKey: ["admin-platform-widgets"] });
    },
    onError: () => toast.error("Não foi possível alterar o widget."),
  });

  const saveNewsSources = useMutation({
    mutationFn: () => {
      const entry = query.data!.news;
      return saveFn({
        data: {
          type: "news",
          active: entry.active,
          name: entry.name,
          config: entry.config,
          availableNewsFeedIds: newsFeedIds,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Fontes oficiais atualizadas.");
      await queryClient.invalidateQueries({ queryKey: ["admin-platform-widgets"] });
    },
    onError: () => toast.error("Não foi possível salvar as fontes oficiais."),
  });

  if (query.isPending || !query.data) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Widgets globais</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Controle apenas quais recursos ficam disponíveis e quais fontes oficiais podem ser usadas.
          A aparência, ordem, conteúdo e tempo de exibição ficam sob autonomia de cada empresa no
          Studio.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLATFORM_WIDGET_TYPES.map((type) => {
          const entry = query.data[type];
          return (
            <Card key={type} className="overflow-hidden">
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{entry.name}</p>
                    <p className="text-xs text-muted-foreground">Recurso global</p>
                  </div>
                  <Badge variant={entry.active ? "default" : "secondary"}>
                    {entry.active ? "Ativo no Studio" : "Inativo"}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant={entry.active ? "outline" : "default"}
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(type)}
                >
                  <Power className="size-4" />
                  {entry.active ? "Desativar" : "Ativar"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h2 className="font-semibold">Fontes oficiais de notícias</h2>
            <p className="text-sm text-muted-foreground">
              A Torre controla somente quais fontes padrão ficam liberadas. Cada empresa escolhe e
              personaliza sua exibição no Studio.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {NEWS_FEEDS.map((feed) => {
              const selected = newsFeedIds.includes(feed.id);
              return (
                <Button
                  key={feed.id}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  onClick={() =>
                    setNewsFeedIds((current) =>
                      selected
                        ? current.length > 1
                          ? current.filter((id) => id !== feed.id)
                          : current
                        : [...current, feed.id],
                    )
                  }
                >
                  {feed.label}
                </Button>
              );
            })}
          </div>
          <Button onClick={() => saveNewsSources.mutate()} disabled={saveNewsSources.isPending}>
            {saveNewsSources.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Salvar fontes oficiais
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
