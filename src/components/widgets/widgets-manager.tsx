import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gauge, Loader2, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WidgetComposer, type WidgetDraft } from "@/components/widgets/widget-composer";
import { WidgetView } from "@/components/widgets/widget-view";
import { deleteMediaAsset, listMediaAssets } from "@/lib/media/media.functions";
import { getWidgetDefinition } from "@/lib/widgets/catalog";

/** Página exclusiva para criar, personalizar e remover widgets de informação. */
export function WidgetsManager() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listMediaAssets);
  const deleteFn = useServerFn(deleteMediaAsset);
  const composerRef = useRef<HTMLDivElement>(null);
  const [editingWidget, setEditingWidget] = useState<WidgetDraft | null>(null);

  const library = useQuery({ queryKey: ["media-assets"], queryFn: () => listFn({}) });

  const removeMutation = useMutation({
    mutationFn: (assetId: string) => deleteFn({ data: { assetId } }),
    onSuccess: async () => {
      toast.success("Widget removido.");
      await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
    },
    onError: () => toast.error("Não foi possível remover este widget."),
  });

  const widgets = (library.data?.items ?? []).filter(
    (item) => item.kind === "widget" && Boolean(item.widgetConfig),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Widgets</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Monte relógios, previsão do tempo, cotações e notícias RSS. Cada widget criado aqui fica
          disponível para ser adicionado às suas playlists.
        </p>
      </div>

      <div ref={composerRef}>
        <WidgetComposer editing={editingWidget} onCancelEditing={() => setEditingWidget(null)} />
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Meus widgets</h2>
        {library.isPending ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : widgets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum widget criado ainda. Use o painel acima para criar o primeiro.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {widgets.map((item) => (
              <div key={item.id} className="overflow-hidden rounded-xl border border-border">
                <div className="aspect-video w-full bg-muted">
                  <WidgetView config={item.widgetConfig!} />
                </div>
                <div className="flex items-start justify-between gap-2 p-3">
                  <div className="min-w-0 space-y-1.5">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      <Gauge className="size-4 shrink-0 text-muted-foreground" />
                      {item.name}
                    </p>
                    <Badge variant="secondary">
                      {getWidgetDefinition(item.widgetType ?? "clock").label}
                    </Badge>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground"
                      onClick={() => {
                        setEditingWidget({
                          assetId: item.id,
                          name: item.name,
                          config: item.widgetConfig!,
                        });
                        composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      aria-label={`Personalizar ${item.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground"
                      onClick={() => removeMutation.mutate(item.id)}
                      disabled={removeMutation.isPending}
                      aria-label={`Remover ${item.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
