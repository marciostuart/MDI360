import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchAppDownloadsContent,
  saveAppDownloadsContent,
} from "@/lib/downloads/app-content.functions";
import {
  APP_DOWNLOAD_IDS,
  type AppDownloadContent,
  type AppDownloadId,
  type AppDownloadLink,
  type AppDownloadsContent,
} from "@/lib/downloads/app-content";

export const Route = createFileRoute("/torre/aplicativos")({
  head: () => ({
    meta: [
      { title: "Aplicativos | Torre MDI 360" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AppsEditor,
});

const APP_LABELS: Record<AppDownloadId, string> = {
  android: "Android",
  roku: "Roku",
  windows: "Windows",
  linux: "MiniOS / Linux",
};

const linksToText = (links: AppDownloadLink[]) =>
  links
    .map((link) => `${link.label} | ${link.href}${link.secondary ? " | secundário" : ""}`)
    .join("\n");

const textToLinks = (value: string): AppDownloadLink[] =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label = "", href = "", style = ""] = line.split("|").map((part) => part.trim());
      return {
        label,
        href,
        secondary: ["secundário", "secundario", "secondary"].includes(style.toLowerCase()),
      };
    })
    .filter((link) => link.label && link.href);

const listToText = (items: string[]) => items.join("\n");
const textToList = (value: string) =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

function AppsEditor() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["app-downloads-content"],
    queryFn: () => fetchAppDownloadsContent(),
  });
  const [draft, setDraft] = useState<AppDownloadsContent | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (content: AppDownloadsContent) => saveAppDownloadsContent({ data: content }),
    onSuccess: () => {
      toast.success("Páginas dos aplicativos atualizadas.");
      void queryClient.invalidateQueries({ queryKey: ["app-downloads-content"] });
    },
    onError: () => toast.error("Não foi possível salvar. Confira os campos e os links."),
  });

  if (isPending || !draft) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const setGlobal = <K extends keyof Omit<AppDownloadsContent, "apps">>(
    key: K,
    value: AppDownloadsContent[K],
  ) => setDraft((current) => (current ? { ...current, [key]: value } : current));

  const setApp = <K extends keyof AppDownloadContent>(
    appId: AppDownloadId,
    key: K,
    value: AppDownloadContent[K],
  ) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            apps: {
              ...current.apps,
              [appId]: { ...current.apps[appId], [key]: value },
            },
          }
        : current,
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Aplicativos e downloads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Edite os cards, links e instruções. Depois de salvar, o conteúdo entra no painel sem
            novo deploy.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="/studio/downloads" target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 size-4" />
              Visualizar
            </a>
          </Button>
          <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Salvar aplicativos
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Central de downloads</CardTitle>
          <CardDescription>Textos gerais exibidos antes e depois dos aplicativos.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <Field label="Título">
            <Input
              value={draft.heading}
              onChange={(event) => setGlobal("heading", event.target.value)}
            />
          </Field>
          <Field label="Introdução">
            <Textarea
              rows={3}
              value={draft.introduction}
              onChange={(event) => setGlobal("introduction", event.target.value)}
            />
          </Field>
          <Field label="Texto final" wide>
            <Textarea
              rows={3}
              value={draft.footer}
              onChange={(event) => setGlobal("footer", event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Tabs defaultValue="android" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          {APP_DOWNLOAD_IDS.map((appId) => (
            <TabsTrigger key={appId} value={appId}>
              {APP_LABELS[appId]}
            </TabsTrigger>
          ))}
        </TabsList>
        {APP_DOWNLOAD_IDS.map((appId) => (
          <TabsContent key={appId} value={appId}>
            <AppEditor
              appId={appId}
              app={draft.apps[appId]}
              onChange={(key, value) => setApp(appId, key, value)}
            />
          </TabsContent>
        ))}
      </Tabs>

      <div className="flex justify-end">
        <Button size="lg" onClick={() => save.mutate(draft)} disabled={save.isPending}>
          <Save className="mr-2 size-4" />
          Salvar aplicativos
        </Button>
      </div>
    </div>
  );
}

function AppEditor({
  appId,
  app,
  onChange,
}: {
  appId: AppDownloadId;
  app: AppDownloadContent;
  onChange: <K extends keyof AppDownloadContent>(key: K, value: AppDownloadContent[K]) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{APP_LABELS[appId]}</CardTitle>
          <CardDescription>Conteúdo do card e da página dedicada deste aplicativo.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`enabled-${appId}`}>Exibir no painel</Label>
          <Switch
            id={`enabled-${appId}`}
            checked={app.enabled}
            onCheckedChange={(checked) => onChange("enabled", checked)}
          />
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        <Field label="Nome do aplicativo">
          <Input value={app.title} onChange={(event) => onChange("title", event.target.value)} />
        </Field>
        <Field label="Descrição curta do card">
          <Input
            value={app.cardDescription}
            onChange={(event) => onChange("cardDescription", event.target.value)}
          />
        </Field>
        <Field label="Detalhe do card" wide>
          <Textarea
            rows={2}
            value={app.cardDetail}
            onChange={(event) => onChange("cardDetail", event.target.value)}
          />
        </Field>
        <Field label="Descrição da página" wide>
          <Textarea
            rows={2}
            value={app.pageDescription}
            onChange={(event) => onChange("pageDescription", event.target.value)}
          />
        </Field>
        <Field label="Texto da área de download" wide>
          <Input
            value={app.downloadDescription}
            onChange={(event) => onChange("downloadDescription", event.target.value)}
          />
        </Field>
        <Field
          label="Botões de download — Rótulo | URL | secundário (opcional)"
          hint="Use uma linha para cada botão. Links relativos, como /mdi360-roku.zip, também são aceitos."
          wide
        >
          <BufferedTextarea
            rows={4}
            value={linksToText(app.downloads)}
            onCommit={(value) => onChange("downloads", textToLinks(value))}
            className="font-mono text-xs"
          />
        </Field>
        <Field
          label="Instalação passo a passo"
          hint="Digite uma etapa por linha, na ordem correta."
          wide
        >
          <BufferedTextarea
            rows={12}
            value={listToText(app.steps)}
            onCommit={(value) => onChange("steps", textToList(value))}
          />
        </Field>
        <Field label="Informações importantes" hint="Digite uma observação por linha." wide>
          <BufferedTextarea
            rows={7}
            value={listToText(app.notes)}
            onCommit={(value) => onChange("notes", textToList(value))}
          />
        </Field>
      </CardContent>
    </Card>
  );
}

function BufferedTextarea({
  value,
  onCommit,
  ...props
}: Omit<ComponentProps<typeof Textarea>, "value" | "onChange" | "onBlur"> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [localValue, setLocalValue] = useState(value);
  useEffect(() => setLocalValue(value), [value]);
  return (
    <Textarea
      {...props}
      value={localValue}
      onChange={(event) => setLocalValue(event.target.value)}
      onBlur={() => onCommit(localValue)}
    />
  );
}

function Field({
  label,
  hint,
  wide = false,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-2 ${wide ? "md:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
