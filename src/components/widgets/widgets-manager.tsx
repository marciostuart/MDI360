import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CloudSun,
  Gauge,
  Loader2,
  Newspaper,
  Pencil,
  Plus,
  Trophy,
  Trash2,
  WalletCards,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WidgetComposer, type WidgetDraft } from "@/components/widgets/widget-composer";
import { PlatformWidgetPreferences } from "@/components/widgets/platform-widget-preferences";
import { WidgetView } from "@/components/widgets/widget-view";
import { deleteMediaAsset, listMediaAssets, type MediaListItem } from "@/lib/media/media.functions";

/** Página exclusiva para criar, personalizar e remover widgets de informação. */
export function WidgetsManager() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listMediaAssets);
  const deleteFn = useServerFn(deleteMediaAsset);
  const composerRef = useRef<HTMLDivElement>(null);
  const preferencesRef = useRef<HTMLDivElement>(null);
  const [editingWidget, setEditingWidget] = useState<WidgetDraft | null>(null);
  const [managedWidget, setManagedWidget] = useState<MediaListItem | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

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
  const localWidgets = widgets.filter((item) => !item.platformManaged);
  const managedWidgets = widgets.filter((item) => item.platformManaged);

  const widgetInfo = {
    clock: { icon: Gauge, label: "Relógio e data" },
    weather: { icon: CloudSun, label: "Clima" },
    currency: { icon: WalletCards, label: "Cotações" },
    news: { icon: Newspaper, label: "Notícias" },
    lottery: { icon: Trophy, label: "Loterias CAIXA" },
  } as const;

  function openLocalEditor(item: MediaListItem) {
    setManagedWidget(null);
    setComposerOpen(true);
    setEditingWidget({ assetId: item.id, name: item.name, config: item.widgetConfig! });
    window.setTimeout(
      () => composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  function openManagedEditor(item: MediaListItem) {
    setEditingWidget(null);
    setManagedWidget(item);
    window.setTimeout(
      () => preferencesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  function renderCard(item: MediaListItem) {
    const type = (item.widgetType ?? "clock") as keyof typeof widgetInfo;
    const info = widgetInfo[type] ?? widgetInfo.clock;
    const Icon = info.icon;
    return (
      <div key={item.id} className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          <WidgetView config={item.widgetConfig!} />
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate text-sm font-medium">
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                {item.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{info.label}</p>
            </div>
            <Badge variant={item.platformManaged ? "secondary" : "outline"}>
              {item.platformManaged ? "Disponível" : "Da empresa"}
            </Badge>
          </div>
          {item.platformManaged ? (
            <Button className="w-full" variant="outline" onClick={() => openManagedEditor(item)}>
              <Pencil className="size-4" />
              Configurar
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button className="flex-1" variant="outline" onClick={() => openLocalEditor(item)}>
                <Pencil className="size-4" />
                Editar
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => removeMutation.mutate(item.id)}
                disabled={removeMutation.isPending}
                aria-label={`Remover ${item.name}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Badge variant="outline">Personalização da empresa</Badge>
        <h1 className="text-3xl font-semibold">Widgets</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Configure primeiro os recursos disponíveis, depois seus widgets próprios e, quando
          precisar, crie um novo widget.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Recursos disponíveis</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Notícias, loterias e cotações são liberadas pela plataforma e personalizadas por você.
          </p>
        </div>
        {managedWidget ? (
          <div ref={preferencesRef}>
            <PlatformWidgetPreferences
              item={managedWidget}
              onClose={() => setManagedWidget(null)}
            />
          </div>
        ) : null}
        {managedWidgets.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {managedWidgets.map(renderCard)}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Nenhum recurso foi liberado para esta empresa no momento.
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Widgets da empresa</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Relógio e clima criados pela sua equipe, com liberdade de configuração.
          </p>
        </div>
        {library.isPending ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : localWidgets.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {localWidgets.map(renderCard)}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Ainda não há widgets próprios.
          </div>
        )}
      </section>

      <section ref={composerRef} className="space-y-3 border-t border-border pt-6">
        <div>
          <h2 className="text-xl font-semibold">Adicionar novo widget</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            O editor só é carregado quando você solicitar, mantendo esta página mais leve.
          </p>
        </div>
        {!composerOpen ? (
          <Button
            variant="outline"
            onClick={() => {
              setEditingWidget(null);
              setComposerOpen(true);
            }}
          >
            <Plus className="size-4" />
            Abrir editor de widget
          </Button>
        ) : (
          <WidgetComposer
            editing={editingWidget}
            allowedTypes={["clock", "weather"]}
            onCancelEditing={() => {
              setEditingWidget(null);
              setComposerOpen(false);
            }}
          />
        )}
      </section>
    </div>
  );
}
