import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CloudSun,
  Gauge,
  Loader2,
  Newspaper,
  Pencil,
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
    setEditingWidget({ assetId: item.id, name: item.name, config: item.widgetConfig! });
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
          Escolha o que aparece nas suas telas. Crie um widget ou abra um recurso disponível e
          ajuste somente o que importa para o seu público.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["1", "Escolha", "Selecione um widget próprio ou um recurso liberado."],
          ["2", "Configure", "Ajuste fonte, formato e conteúdo em linguagem simples."],
          ["3", "Publique", "Salve e a mudança chega às telas na próxima sincronização."],
        ].map(([number, title, text]) => (
          <div key={number} className="rounded-xl border border-border bg-card/60 p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {number}
              </span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <section ref={composerRef} className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Widgets da empresa</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Relógio e clima podem ser criados e editados livremente pela sua equipe.
            </p>
          </div>
          <Button variant="outline" onClick={() => setEditingWidget(null)}>
            <Plus className="size-4" />
            Novo widget
          </Button>
        </div>
        <WidgetComposer
          editing={editingWidget}
          allowedTypes={["clock", "weather"]}
          onCancelEditing={() => setEditingWidget(null)}
        />
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
            Ainda não há widgets próprios. Crie um relógio ou um clima acima.
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Recursos disponíveis</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Notícias, loterias e cotações são mantidos pela plataforma, mas a escolha do conteúdo é
            sua.
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
    </div>
  );
}
