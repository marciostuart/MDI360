import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudSun, DatabaseZap, Loader2, Newspaper, Plus, Save, TestTube2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  fetchDataSourcesAdmin,
  saveDataSourcesAdmin,
  testLotteryDataSource,
  testNewsDataSource,
} from "@/lib/admin/data-sources.functions";
import type { DataSourcesInput } from "@/lib/widgets/data-sources";
import { DEFAULT_NEWS_SOURCES } from "@/lib/widgets/data-sources";
import { WEATHER_VIDEO_CONDITIONS } from "@/lib/widgets/catalog";

export const Route = createFileRoute("/torre/fontes")({
  head: () => ({
    meta: [
      { title: "Fontes de dados | Torre MDI 360" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DataSourcesPage,
});

function DataSourcesPage() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["admin-data-sources"],
    queryFn: () => fetchDataSourcesAdmin(),
  });
  const [draft, setDraft] = useState<DataSourcesInput | null>(null);
  const [newNewsSource, setNewNewsSource] = useState({
    label: "",
    url: "",
    credit: "",
    refreshMinutes: 30,
  });

  useEffect(() => {
    if (!data) return;
    setDraft({
      lotteryRelay: {
        enabled: data.lotteryRelay.enabled,
        refreshMinutes: data.lotteryRelay.refreshMinutes,
        url: data.lotteryRelay.url,
        token: "",
        clearToken: false,
      },
      news: data.news,
      weatherVideos: data.weatherVideos,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: (value: DataSourcesInput) => saveDataSourcesAdmin({ data: value }),
    onSuccess: () => {
      toast.success("Fontes de dados atualizadas.");
      void queryClient.invalidateQueries({ queryKey: ["admin-data-sources"] });
      void queryClient.invalidateQueries({ queryKey: ["widget-public-sources"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao salvar."),
  });
  const testLottery = useMutation({
    mutationFn: () => testLotteryDataSource(),
    onSuccess: (result) =>
      result.ok
        ? toast.success(`Fonte oficial validada. ${result.updated} resultado(s) atualizado(s).`)
        : toast.error(result.error || "A fonte ainda não respondeu."),
    onError: () => toast.error("Não foi possível testar a fonte de loterias."),
  });
  const testNews = useMutation({
    mutationFn: (id: string) => testNewsDataSource({ data: { id } }),
    onSuccess: (result) =>
      result.ok
        ? toast.success("Feed RSS validado.")
        : toast.error(`Feed respondeu HTTP ${result.status}.`),
    onError: () => toast.error("Não foi possível validar o feed RSS."),
  });

  if (isPending || !draft || !data) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const setRelay = <K extends keyof DataSourcesInput["lotteryRelay"]>(
    key: K,
    value: DataSourcesInput["lotteryRelay"][K],
  ) =>
    setDraft((current) =>
      current ? { ...current, lotteryRelay: { ...current.lotteryRelay, [key]: value } } : current,
    );

  const setWeatherVideo = (
    condition: (typeof WEATHER_VIDEO_CONDITIONS)[number]["id"],
    period: "day" | "night",
    value: string,
  ) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            weatherVideos: {
              ...current.weatherVideos,
              [condition]: { ...current.weatherVideos[condition], [period]: value },
            },
          }
        : current,
    );

  const addNewsSource = () => {
    const label = newNewsSource.label.trim();
    const url = newNewsSource.url.trim();
    const credit = newNewsSource.credit.trim() || label;
    if (!label || !url.startsWith("https://")) {
      toast.error("Informe um nome e uma URL HTTPS válida para o feed RSS.");
      return;
    }
    const id = `global-${crypto.randomUUID()}`;
    setDraft((current) =>
      current
        ? {
            ...current,
            news: {
              ...current.news,
              [id]: {
                enabled: true,
                refreshMinutes: newNewsSource.refreshMinutes,
                label,
                url,
                credit,
              },
            },
          }
        : current,
    );
    setNewNewsSource({ label: "", url: "", credit: "", refreshMinutes: 30 });
    toast.success("Fonte RSS adicionada. Clique em Salvar fontes para publicá-la.");
  };

  const removeNewsSource = (id: string) =>
    setDraft((current) => {
      if (!current) return current;
      const news = { ...current.news };
      delete news[id];
      return { ...current, news };
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Fontes de dados</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie as integrações globais usadas pelos widgets de todos os clientes.
          </p>
        </div>
        <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Save className="mr-2 size-4" />
          )}
          Salvar fontes
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseZap className="size-5" />
            Loterias CAIXA
          </CardTitle>
          <CardDescription>
            Relay privado para consultar exclusivamente a fonte oficial quando a CAIXA bloqueia o IP
            da VPS.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="flex items-center gap-3 md:col-span-2">
            <Switch
              checked={draft.lotteryRelay.enabled}
              onCheckedChange={(value) => setRelay("enabled", value)}
            />
            <Label>Ativar relay oficial</Label>
          </div>
          <Field label="Frequência de atualização">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.lotteryRelay.refreshMinutes}
              onChange={(event) => setRelay("refreshMinutes", Number(event.target.value))}
            >
              <option value={5}>A cada 5 minutos</option>
              <option value={15}>A cada 15 minutos</option>
              <option value={30}>A cada 30 minutos (recomendado)</option>
              <option value={60}>A cada 1 hora</option>
              <option value={180}>A cada 3 horas</option>
              <option value={360}>A cada 6 horas</option>
            </select>
          </Field>
          <div className="flex items-end text-xs text-muted-foreground">
            Falhas 401/403 entram automaticamente em espera por 6 horas. O teste manual ignora essa
            espera.
          </div>
          <Field label="URL HTTPS do Cloudflare Worker">
            <Input
              placeholder="https://mdi360-loterias.seu-usuario.workers.dev"
              value={draft.lotteryRelay.url}
              onChange={(event) => setRelay("url", event.target.value)}
            />
          </Field>
          <Field
            label={`Token privado${data.lotteryRelay.tokenConfigured ? " (já configurado)" : ""}`}
          >
            <Input
              type="password"
              autoComplete="new-password"
              placeholder={
                data.lotteryRelay.tokenConfigured
                  ? "Deixe vazio para manter o atual"
                  : "Informe o mesmo secret do Worker"
              }
              value={draft.lotteryRelay.token}
              onChange={(event) => setRelay("token", event.target.value)}
            />
          </Field>
          <div className="rounded-lg border border-border p-4 text-sm md:col-span-2">
            <p>Última tentativa: {formatDate(data.lotteryStatus.lastAttemptAt)}</p>
            <p>Último sucesso: {formatDate(data.lotteryStatus.lastSuccessAt)}</p>
            {data.lotteryStatus.nextAttemptAt && (
              <p>Bloqueio/retentativa até: {formatDate(data.lotteryStatus.nextAttemptAt)}</p>
            )}
            {data.lotteryStatus.lastError && (
              <p className="mt-2 text-destructive">{data.lotteryStatus.lastError}</p>
            )}
          </div>
          <div className="md:col-span-2">
            <Button
              variant="outline"
              onClick={() => testLottery.mutate()}
              disabled={testLottery.isPending}
            >
              <TestTube2 className="mr-2 size-4" />
              Testar e sincronizar agora
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="size-5" />
            Notícias RSS
          </CardTitle>
          <CardDescription>
            Ative, desative ou altere as fontes oferecidas no editor de widgets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(draft.news).map(([id, source]) => (
            <div
              key={id}
              className="grid gap-4 rounded-xl border border-border p-4 md:grid-cols-[auto_1fr_1fr_11rem_auto] md:items-end"
            >
              <Switch
                checked={source.enabled}
                onCheckedChange={(enabled) =>
                  setDraft((current) =>
                    current
                      ? { ...current, news: { ...current.news, [id]: { ...source, enabled } } }
                      : current,
                  )
                }
              />
              <Field label="Nome exibido">
                <Input
                  value={source.label}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            news: {
                              ...current.news,
                              [id]: { ...source, label: event.target.value },
                            },
                          }
                        : current,
                    )
                  }
                />
              </Field>
              <Field label="Crédito da fonte">
                <Input
                  value={source.credit}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            news: {
                              ...current.news,
                              [id]: { ...source, credit: event.target.value },
                            },
                          }
                        : current,
                    )
                  }
                />
              </Field>
              <Field label="Atualizar a cada">
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={source.refreshMinutes}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            news: {
                              ...current.news,
                              [id]: { ...source, refreshMinutes: Number(event.target.value) },
                            },
                          }
                        : current,
                    )
                  }
                >
                  <option value={5}>5 minutos</option>
                  <option value={15}>15 minutos</option>
                  <option value={30}>30 minutos</option>
                  <option value={60}>1 hora</option>
                  <option value={180}>3 horas</option>
                </select>
              </Field>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => testNews.mutate(id)}>
                  <TestTube2 className="mr-2 size-4" />
                  Testar
                </Button>
                {!Object.prototype.hasOwnProperty.call(DEFAULT_NEWS_SOURCES, id) && (
                  <Button
                    variant="outline"
                    title="Remover fonte RSS"
                    onClick={() => removeNewsSource(id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <div className="md:col-start-2 md:col-span-4">
                <Field label="URL HTTPS do feed RSS">
                  <Input
                    value={source.url}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              news: {
                                ...current.news,
                                [id]: { ...source, url: event.target.value },
                              },
                            }
                          : current,
                      )
                    }
                  />
                </Field>
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-dashed border-border p-4">
            <div className="mb-4 flex items-center gap-2">
              <Plus className="size-5" />
              <div>
                <p className="font-medium">Adicionar fonte RSS padrão</p>
                <p className="text-sm text-muted-foreground">
                  A nova fonte ficará disponível para todas as empresas, que ainda poderão escolher
                  se desejam utilizá-la.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_1.5fr_1fr_11rem_auto] md:items-end">
              <Field label="Nome exibido">
                <Input
                  value={newNewsSource.label}
                  onChange={(event) =>
                    setNewNewsSource((current) => ({ ...current, label: event.target.value }))
                  }
                  placeholder="Ex.: Notícias da cidade"
                />
              </Field>
              <Field label="URL HTTPS do feed RSS">
                <Input
                  value={newNewsSource.url}
                  onChange={(event) =>
                    setNewNewsSource((current) => ({ ...current, url: event.target.value }))
                  }
                  placeholder="https://exemplo.com/rss.xml"
                />
              </Field>
              <Field label="Crédito da fonte">
                <Input
                  value={newNewsSource.credit}
                  onChange={(event) =>
                    setNewNewsSource((current) => ({ ...current, credit: event.target.value }))
                  }
                  placeholder="Ex.: Portal local"
                />
              </Field>
              <Field label="Atualizar a cada">
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={newNewsSource.refreshMinutes}
                  onChange={(event) =>
                    setNewNewsSource((current) => ({
                      ...current,
                      refreshMinutes: Number(event.target.value),
                    }))
                  }
                >
                  <option value={5}>5 minutos</option>
                  <option value={15}>15 minutos</option>
                  <option value={30}>30 minutos</option>
                  <option value={60}>1 hora</option>
                  <option value={180}>3 horas</option>
                </select>
              </Field>
              <Button onClick={addNewsSource}>
                <Plus className="mr-2 size-4" />
                Adicionar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudSun className="size-5" />
            Fundos interativos do clima
          </CardTitle>
          <CardDescription>
            Informe URLs HTTPS de vídeos MP4 ou WebM. O cliente poderá escolher “Fundo Interativo”
            no widget Clima; o sistema selecionará automaticamente o vídeo conforme a condição e se
            é dia ou noite.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {WEATHER_VIDEO_CONDITIONS.map((condition) => (
            <div
              key={condition.id}
              className="grid gap-4 rounded-xl border border-border p-4 md:grid-cols-2"
            >
              <div className="md:col-span-2">
                <p className="font-medium">{condition.label}</p>
              </div>
              <Field label="Vídeo durante o dia (HTTPS)">
                <Input
                  placeholder="https://.../clima-dia.mp4"
                  value={draft.weatherVideos[condition.id].day}
                  onChange={(event) => setWeatherVideo(condition.id, "day", event.target.value)}
                />
              </Field>
              <Field label="Vídeo durante a noite (HTTPS)">
                <Input
                  placeholder="https://.../clima-noite.mp4"
                  value={draft.weatherVideos[condition.id].night}
                  onChange={(event) => setWeatherVideo(condition.id, "night", event.target.value)}
                />
              </Field>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Ainda não registrado";
}
