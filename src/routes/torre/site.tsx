import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchLandingContent, saveLandingContent } from "@/lib/landing/landing.functions";
import type { LandingContent, LandingFaq, LandingItem } from "@/lib/landing/landing-content";

export const Route = createFileRoute("/torre/site")({
  head: () => ({
    meta: [{ title: "Site | Torre MDI 360" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: LandingEditor,
});

const itemLines = (items: LandingItem[]) =>
  items.map((item) => `${item.title} | ${item.description}`).join("\n");
const faqLines = (items: LandingFaq[]) =>
  items.map((item) => `${item.question} | ${item.answer}`).join("\n");
const parseItems = (value: string): LandingItem[] =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, ...rest] = line.split("|");
      return { title: title.trim(), description: rest.join("|").trim() };
    })
    .filter((item) => item.title && item.description);
const parseFaq = (value: string): LandingFaq[] =>
  parseItems(value).map((item) => ({ question: item.title, answer: item.description }));

function LandingEditor() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["landing-content"],
    queryFn: () => fetchLandingContent(),
  });
  const [draft, setDraft] = useState<LandingContent | null>(null);
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);
  const save = useMutation({
    mutationFn: (content: LandingContent) => saveLandingContent({ data: content }),
    onSuccess: () => {
      toast.success("Site atualizado.");
      void queryClient.invalidateQueries({ queryKey: ["landing-content"] });
    },
    onError: () => toast.error("Não foi possível salvar. Confira os campos e seu acesso."),
  });
  if (isPending || !draft)
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  const set = <K extends keyof LandingContent>(key: K, value: LandingContent[K]) =>
    setDraft((current) => current && { ...current, [key]: value });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Landing page</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Edite textos, links e imagens. Depois de salvar, o conteúdo entra no ar sem novo deploy.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="/" target="_blank" rel="noreferrer">
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
            Salvar site
          </Button>
        </div>
      </div>
      <EditorCard title="Hero" description="A primeira mensagem que o visitante vê.">
        <Field label="Chamada superior">
          <Input value={draft.eyebrow} onChange={(e) => set("eyebrow", e.target.value)} />
        </Field>
        <Field label="Título principal">
          <Input value={draft.headline} onChange={(e) => set("headline", e.target.value)} />
        </Field>
        <Field label="Título em destaque">
          <Input
            value={draft.highlightedHeadline}
            onChange={(e) => set("highlightedHeadline", e.target.value)}
          />
        </Field>
        <Field label="Descrição" wide>
          <Textarea
            rows={4}
            value={draft.heroDescription}
            onChange={(e) => set("heroDescription", e.target.value)}
          />
        </Field>
        <Field label="Botão principal">
          <Input value={draft.primaryCta} onChange={(e) => set("primaryCta", e.target.value)} />
        </Field>
        <Field label="Botão secundário">
          <Input value={draft.secondaryCta} onChange={(e) => set("secondaryCta", e.target.value)} />
        </Field>
        <Field label="Compatibilidade / prova" wide>
          <Input value={draft.proofLine} onChange={(e) => set("proofLine", e.target.value)} />
        </Field>
      </EditorCard>
      <EditorCard
        title="Imagens e contato"
        description="Deixe a URL vazia para manter o mockup ilustrativo. Aceita URLs públicas do seu armazenamento."
      >
        <Field label="Imagem da hero" wide>
          <Input
            value={draft.heroImageUrl}
            placeholder="https://..."
            onChange={(e) => set("heroImageUrl", e.target.value)}
          />
        </Field>
        <Field label="Imagem da plataforma" wide>
          <Input
            value={draft.platformImageUrl}
            placeholder="https://..."
            onChange={(e) => set("platformImageUrl", e.target.value)}
          />
        </Field>
        <Field label="Imagem do sistema de senhas" wide>
          <Input
            value={draft.queueImageUrl}
            placeholder="https://..."
            onChange={(e) => set("queueImageUrl", e.target.value)}
          />
        </Field>
        <Field label="Link do WhatsApp" wide>
          <Input value={draft.whatsappUrl} onChange={(e) => set("whatsappUrl", e.target.value)} />
        </Field>
      </EditorCard>
      <EditorCard
        title="Conteúdo comercial"
        description="Use uma linha por item no formato Título | Descrição."
      >
        <Field label="Números e provas" wide>
          <ListEditor
            rows={5}
            initialValue={itemLines(draft.stats)}
            onValue={(value) => set("stats", parseItems(value))}
          />
        </Field>
        <Field label="Públicos atendidos" wide>
          <ListEditor
            rows={7}
            initialValue={itemLines(draft.audiences)}
            onValue={(value) => set("audiences", parseItems(value))}
          />
        </Field>
        <Field label="Diferenciais" wide>
          <ListEditor
            rows={9}
            initialValue={itemLines(draft.features)}
            onValue={(value) => set("features", parseItems(value))}
          />
        </Field>
      </EditorCard>
      <EditorCard
        title="Parceiros, FAQ e fechamento"
        description="Argumentos finais para cliente direto e revendedores."
      >
        <Field label="Título para revendas" wide>
          <Input
            value={draft.resellerTitle}
            onChange={(e) => set("resellerTitle", e.target.value)}
          />
        </Field>
        <Field label="Descrição para revendas" wide>
          <Textarea
            rows={4}
            value={draft.resellerDescription}
            onChange={(e) => set("resellerDescription", e.target.value)}
          />
        </Field>
        <Field label="Perguntas frequentes: Pergunta | Resposta" wide>
          <ListEditor
            rows={9}
            initialValue={faqLines(draft.faqs)}
            onValue={(value) => set("faqs", parseFaq(value))}
          />
        </Field>
        <Field label="Título final" wide>
          <Input value={draft.finalTitle} onChange={(e) => set("finalTitle", e.target.value)} />
        </Field>
        <Field label="Descrição final" wide>
          <Textarea
            rows={3}
            value={draft.finalDescription}
            onChange={(e) => set("finalDescription", e.target.value)}
          />
        </Field>
      </EditorCard>
      <div className="flex justify-end">
        <Button size="lg" onClick={() => save.mutate(draft)} disabled={save.isPending}>
          <Save className="mr-2 size-4" />
          Salvar site
        </Button>
      </div>
    </div>
  );
}

function EditorCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">{children}</CardContent>
    </Card>
  );
}
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`space-y-2 ${wide ? "md:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ListEditor({
  initialValue,
  onValue,
  rows,
}: {
  initialValue: string;
  onValue: (value: string) => void;
  rows: number;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <Textarea
      rows={rows}
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        onValue(event.target.value);
      }}
    />
  );
}
