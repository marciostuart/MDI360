import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseZap, Loader2, Newspaper, Save, TestTube2 } from "lucide-react";
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
              <Button variant="outline" onClick={() => testNews.mutate(id)}>
                Testar
              </Button>
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
