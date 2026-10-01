import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  fetchOrganizationNewsSources,
  saveOrganizationNewsSources,
  type OrganizationNewsSource,
} from "@/lib/widgets/organization-news-sources.functions";

type DraftSource = Omit<OrganizationNewsSource, "id"> & { id?: string };

const blankSource = (): DraftSource => ({
  label: "",
  url: "",
  credit: "",
  enabled: true,
  refreshMinutes: 30,
});

export function OrganizationNewsSources() {
  const queryClient = useQueryClient();
  const fetchFn = useServerFn(fetchOrganizationNewsSources);
  const saveFn = useServerFn(saveOrganizationNewsSources);
  const sourcesQuery = useQuery({
    queryKey: ["organization-news-sources"],
    queryFn: () => fetchFn(),
  });
  const [sources, setSources] = useState<DraftSource[]>([]);

  useEffect(() => {
    if (sourcesQuery.data) setSources(sourcesQuery.data);
  }, [sourcesQuery.data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { sources } }),
    onSuccess: async (saved) => {
      setSources(saved);
      await queryClient.invalidateQueries({ queryKey: ["widget-public-sources"] });
      toast.success("Fontes RSS da empresa atualizadas.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar as fontes."),
  });

  function update(index: number, patch: Partial<DraftSource>) {
    setSources((current) =>
      current.map((source, position) => (position === index ? { ...source, ...patch } : source)),
    );
  }

  if (sourcesQuery.isPending) {
    return (
      <Card>
        <CardContent className="grid place-items-center py-10">
          <Loader2 className="size-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Fontes RSS da empresa</CardTitle>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Adicione fontes públicas em HTTPS para personalizar as notícias exibidas nos seus
              terminais. As fontes padrão continuam disponíveis.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => setSources((current) => [...current, blankSource()])}>
            <Plus className="size-4" />
            Adicionar fonte
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma fonte própria cadastrada. Você ainda pode usar as fontes padrão liberadas.
          </p>
        ) : (
          sources.map((source, index) => (
            <div key={source.id ?? "new-" + index} className="space-y-4 rounded-lg border border-border p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome da fonte</Label>
                  <Input
                    value={source.label}
                    placeholder="Ex.: Notícias da cidade"
                    onChange={(event) => update(index, { label: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Crédito exibido</Label>
                  <Input
                    value={source.credit}
                    placeholder="Ex.: Portal da cidade"
                    onChange={(event) => update(index, { credit: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end">
                <div className="space-y-2">
                  <Label>URL do feed RSS (HTTPS)</Label>
                  <Input
                    type="url"
                    value={source.url}
                    placeholder="https://exemplo.com/rss.xml"
                    onChange={(event) => update(index, { url: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Atualizar a cada (min.)</Label>
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    value={source.refreshMinutes}
                    onChange={(event) =>
                      update(index, {
                        refreshMinutes: Math.min(1440, Math.max(5, Number(event.target.value) || 30)),
                      })
                    }
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={source.enabled}
                      onCheckedChange={(enabled) => update(index, { enabled })}
                    />
                    Ativa
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label="Remover fonte"
                    onClick={() => setSources((current) => current.filter((_, position) => position !== index))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Salvar fontes RSS
        </Button>
      </CardContent>
    </Card>
  );
}