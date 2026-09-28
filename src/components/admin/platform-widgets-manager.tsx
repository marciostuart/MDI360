import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Power } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WidgetComposer, type WidgetDraft } from "@/components/widgets/widget-composer";
import { WidgetView } from "@/components/widgets/widget-view";
import {
  fetchPlatformWidgetsAdmin,
  savePlatformWidgetAdmin,
} from "@/lib/admin/platform-widgets.functions";
import { NEWS_FEEDS, getWidgetDefinition, type WidgetConfig } from "@/lib/widgets/catalog";
import { PLATFORM_WIDGET_TYPES, type PlatformWidgetType } from "@/lib/widgets/platform-widgets";

export function PlatformWidgetsManager() {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(savePlatformWidgetAdmin);
  const editorRef = useRef<HTMLDivElement>(null);
  const [editingType, setEditingType] = useState<PlatformWidgetType | null>(null);
  const [newsFeedIds, setNewsFeedIds] = useState<string[]>([]);
  const query = useQuery({
    queryKey: ["admin-platform-widgets"],
    queryFn: () => fetchPlatformWidgetsAdmin(),
  });

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

  if (query.isPending || !query.data) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const editing = editingType
    ? ({
        assetId: `platform-${editingType}`,
        name: query.data[editingType].name,
        config: query.data[editingType].config,
      } satisfies WidgetDraft)
    : null;

  const saveEditing = async (draft: { name: string; config: WidgetConfig }) => {
    if (!editingType) throw new Error("Selecione um widget.");
    const entry = query.data[editingType];
    await saveFn({
      data: {
        type: editingType,
        active: entry.active,
        name: draft.name,
        config: draft.config,
        ...(editingType === "news" ? { availableNewsFeedIds: newsFeedIds } : {}),
      },
    });
    await queryClient.invalidateQueries({ queryKey: ["admin-platform-widgets"] });
    setEditingType(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Widgets globais</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Controle quais widgets de conteúdo ficam disponíveis para todos os clientes e defina sua
          aparência, conteúdo, ordem e tempo de exibição. Relógio e clima continuam personalizados
          por cada estabelecimento.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLATFORM_WIDGET_TYPES.map((type) => {
          const entry = query.data[type];
          return (
            <Card key={type} className="overflow-hidden">
              <div className="relative aspect-video overflow-hidden bg-muted">
                <WidgetView config={entry.config} />
              </div>
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{entry.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {getWidgetDefinition(type).label}
                    </p>
                  </div>
                  <Badge variant={entry.active ? "default" : "secondary"}>
                    {entry.active ? "Ativo no Studio" : "Inativo"}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingType(type);
                      if (type === "news") setNewsFeedIds(entry.availableNewsFeedIds);
                      window.setTimeout(
                        () => editorRef.current?.scrollIntoView({ behavior: "smooth" }),
                        0,
                      );
                    }}
                  >
                    <Pencil className="size-4" />
                    Personalizar
                  </Button>
                  <Button
                    size="sm"
                    variant={entry.active ? "outline" : "default"}
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate(type)}
                  >
                    <Power className="size-4" />
                    {entry.active ? "Desativar" : "Ativar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {editing ? (
        <div ref={editorRef}>
          {editingType === "news" ? (
            <Card className="mb-4">
              <CardContent className="space-y-3 pt-6">
                <div>
                  <h2 className="font-semibold">Fontes liberadas para os clientes</h2>
                  <p className="text-sm text-muted-foreground">
                    O cliente poderá escolher no Studio somente entre as fontes marcadas aqui.
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
              </CardContent>
            </Card>
          ) : null}
          <WidgetComposer
            key={editingType}
            editing={editing}
            allowedTypes={[editingType!]}
            managedByPlatform
            onSave={saveEditing}
            onCancelEditing={() => setEditingType(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
