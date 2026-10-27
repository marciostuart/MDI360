import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_QUIZ, quizSchema, type QuizConfig } from "@/lib/landing/quiz";
import {
  fetchQuizAdmin,
  fetchQuizLeads,
  retryQuizLead,
  saveQuizAdmin,
} from "@/lib/landing/quiz.functions";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export function QuizManager() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["lead-quiz-admin"], queryFn: () => fetchQuizAdmin() });
  const [draft, setDraft] = useState<QuizConfig | null>(null);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  const save = useMutation({
    mutationFn: (config: QuizConfig) => saveQuizAdmin({ data: config }),
    onSuccess: (config) => {
      setDraft(config);
      queryClient.setQueryData(["lead-quiz-admin"], config);
      toast.success("Quiz publicado. Quem já começou mantém a revisão anterior.");
    },
    onError: (error) => toast.error(error.message || "Não foi possível salvar o quiz."),
  });
  if (query.isError)
    return (
      <p role="alert" className="py-8 text-destructive">
        Não foi possível carregar. Verifique seu acesso à Torre e a conexão com o banco.
      </p>
    );
  if (!draft) return <Loader2 className="my-10 size-6 animate-spin" />;
  const set = <K extends keyof QuizConfig>(key: K, value: QuizConfig[K]) =>
    setDraft({ ...draft, [key]: value });
  const stepSet = (stepId: string, change: Partial<QuizConfig["steps"][number]>) =>
    set(
      "steps",
      draft.steps.map((step) => (step.id === stepId ? { ...step, ...change } : step)),
    );
  const targets = [
    { id: "fim_a", title: "Encerramento A — Cliente Final" },
    { id: "fim_b", title: "Encerramento B — Parceiro" },
    ...draft.steps,
  ];
  const destination = (value: string, onChange: (value: string) => void) => (
    <select
      aria-label="Próximo passo"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={selectClass}
    >
      {targets.map((target) => (
        <option key={target.id} value={target.id}>
          {target.id} · {target.title}
        </option>
      ))}
    </select>
  );
  const publish = () => {
    const parsed = quizSchema.safeParse(draft);
    if (!parsed.success) toast.error(parsed.error.issues[0]?.message ?? "Revise o fluxo.");
    else save.mutate(parsed.data);
  };
  return (
    <Tabs defaultValue="editor" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <TabsList>
          <TabsTrigger value="editor">Perguntas e integrações</TabsTrigger>
          <TabsTrigger value="leads">Capturas recebidas</TabsTrigger>
        </TabsList>
        <Button variant="outline" asChild>
          <a href="/diagnostico" target="_blank" rel="noreferrer">
            <ExternalLink className="mr-2 size-4" />
            Abrir quiz publicado
          </a>
        </Button>
      </div>
      <TabsContent value="editor" className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold">Captura interativa</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                As alterações só entram no ar ao publicar. Link público: /diagnostico
              </p>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={draft.enabled} onCheckedChange={(value) => set("enabled", value)} />
              Quiz habilitado
            </label>
          </div>
          <Field label="Título da introdução">
            <Input value={draft.title} onChange={(event) => set("title", event.target.value)} />
          </Field>
          <Field label="Descrição">
            <Textarea
              value={draft.description}
              onChange={(event) => set("description", event.target.value)}
            />
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Chamada do formulário inicial">
              <Input
                value={draft.contactTitle}
                onChange={(event) => set("contactTitle", event.target.value)}
              />
            </Field>
            <Field label="Texto do botão inicial">
              <Input
                value={draft.startLabel}
                onChange={(event) => set("startLabel", event.target.value)}
              />
            </Field>
          </div>
          <Field label="Autorização de contato (obrigatória no formulário)">
            <Textarea
              value={draft.consentText}
              onChange={(event) => set("consentText", event.target.value)}
            />
          </Field>
          <Field label="Primeira pergunta após os dados de contato">
            <select
              value={draft.start}
              onChange={(event) => set("start", event.target.value)}
              className={selectClass}
            >
              {draft.steps.map((step) => (
                <option key={step.id} value={step.id}>
                  {step.title}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <h2 className="font-display text-xl font-semibold">Integrações comerciais</h2>
          <p className="text-sm text-muted-foreground">
            Os dois envios são independentes e paralelos. A captura é preservada mesmo se um serviço
            falhar. A API WhatsApp usa a instância Evolution já configurada no servidor.
          </p>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={draft.integrations.whatsappEnabled}
              onCheckedChange={(value) =>
                set("integrations", { ...draft.integrations, whatsappEnabled: value })
              }
            />
            Enviar resumo para o WhatsApp comercial
          </label>
          <Field label="WhatsApp de destino — país + DDD + número, somente dígitos">
            <Input
              inputMode="tel"
              value={draft.integrations.whatsappRecipient}
              onChange={(event) =>
                set("integrations", {
                  ...draft.integrations,
                  whatsappRecipient: event.target.value.replace(/\D/g, ""),
                })
              }
              placeholder="5531999999999"
            />
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={draft.integrations.webhookEnabled}
              onCheckedChange={(value) =>
                set("integrations", { ...draft.integrations, webhookEnabled: value })
              }
            />
            Enviar payload para o webhook
          </label>
          <Field label="URL do webhook (HTTPS público, porta 443)">
            <Input
              type="url"
              autoComplete="off"
              value={draft.integrations.webhookUrl}
              onChange={(event) =>
                set("integrations", { ...draft.integrations, webhookUrl: event.target.value })
              }
              placeholder="https://seu-crm.com/webhook/..."
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            A URL não é exposta aos visitantes. O cabeçalho Idempotency-Key identifica a captura
            para o CRM deduplicar eventuais tentativas.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Perguntas e fluxos</h2>
            <p className="text-sm text-muted-foreground">
              Defina o destino de cada resposta. Ambos os caminhos começam com os dados de contato.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              const key = id("pergunta");
              set("steps", [
                ...draft.steps,
                {
                  id: key,
                  title: "Nova pergunta",
                  field: key,
                  type: "choice",
                  next: "fim_a",
                  options: [
                    {
                      id: id("opcao"),
                      label: "Nova opção",
                      next: "fim_a",
                      detail: false,
                      detailLabel: "Conte um pouco mais (opcional)",
                    },
                  ],
                },
              ]);
            }}
          >
            <Plus className="mr-2 size-4" />
            Adicionar pergunta
          </Button>
        </div>
        {draft.steps.map((step, index) => (
          <section key={step.id} className="rounded-xl border border-border bg-card p-5 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-xs uppercase tracking-widest text-primary">
                  Pergunta {index + 1} · {step.id}
                </span>
                <h3 className="mt-1 font-medium">{step.title}</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover ${step.title}`}
                onClick={() =>
                  set(
                    "steps",
                    draft.steps.filter((entry) => entry.id !== step.id),
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <Field label="Pergunta">
              <Input
                value={step.title}
                onChange={(event) => stepSet(step.id, { title: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Campo no payload (letras minúsculas, números e _)">
                <Input
                  value={step.field}
                  onChange={(event) => stepSet(step.id, { field: event.target.value })}
                />
              </Field>
              <Field label="Tipo de resposta">
                <select
                  value={step.type}
                  onChange={(event) =>
                    stepSet(step.id, { type: event.target.value as "choice" | "text" })
                  }
                  className={selectClass}
                >
                  <option value="choice">Escolha única</option>
                  <option value="text">Texto obrigatório</option>
                </select>
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Campos padrão: tipo_perfil, nicho_ou_atuacao, quantidade_telas_meta, crm_atual. Campos
              adicionais também são enviados ao webhook. Nome, WhatsApp e e-mail são reservados.
            </p>
            {step.type === "text" ? (
              <Field label="Depois de responder, seguir para">
                {destination(step.next, (value) => stepSet(step.id, { next: value }))}
              </Field>
            ) : (
              <div className="space-y-3">
                {step.options.map((option) => {
                  const update = (change: Partial<typeof option>) =>
                    stepSet(step.id, {
                      options: step.options.map((entry) =>
                        entry.id === option.id ? { ...entry, ...change } : entry,
                      ),
                    });
                  return (
                    <div
                      key={option.id}
                      className="rounded-lg border border-border bg-background/50 p-4 space-y-3"
                    >
                      <div className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
                        <Field label="Texto da opção">
                          <Input
                            value={option.label}
                            onChange={(event) => update({ label: event.target.value })}
                          />
                        </Field>
                        <Field label="Ao selecionar, seguir para">
                          {destination(option.next, (value) => update({ next: value }))}
                        </Field>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remover opção ${option.label}`}
                          onClick={() =>
                            stepSet(step.id, {
                              options: step.options.filter((entry) => entry.id !== option.id),
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <label className="flex items-center gap-3 text-xs">
                        <Switch
                          checked={option.detail}
                          onCheckedChange={(value) => update({ detail: value })}
                        />
                        Pedir detalhe opcional antes de avançar
                      </label>
                      {option.detail ? (
                        <Field label="Rótulo do detalhe">
                          <Input
                            value={option.detailLabel}
                            onChange={(event) => update({ detailLabel: event.target.value })}
                          />
                        </Field>
                      ) : null}
                    </div>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    stepSet(step.id, {
                      options: [
                        ...step.options,
                        {
                          id: id("opcao"),
                          label: "Nova opção",
                          next: "fim_a",
                          detail: false,
                          detailLabel: "Conte um pouco mais (opcional)",
                        },
                      ],
                    })
                  }
                >
                  <Plus className="mr-2 size-4" />
                  Adicionar opção
                </Button>
              </div>
            )}
          </section>
        ))}
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <h2 className="font-display text-xl font-semibold">Encerramentos</h2>
          {(["fim_a", "fim_b"] as const).map((key) => (
            <Field key={key} label={key === "fim_a" ? "A — Cliente Final" : "B — Parceiro SaaS"}>
              <Textarea
                rows={3}
                value={draft.endings[key]}
                onChange={(event) =>
                  set("endings", { ...draft.endings, [key]: event.target.value })
                }
              />
            </Field>
          ))}
        </div>
        <div className="sticky bottom-4 z-10 flex flex-wrap justify-end gap-3 rounded-xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur">
          <Button
            variant="outline"
            onClick={() => {
              if (
                window.confirm(
                  "Restaurar o modelo inicial no rascunho? A publicação atual será mantida até salvar.",
                )
              )
                setDraft(structuredClone(DEFAULT_QUIZ));
            }}
          >
            Restaurar rascunho padrão
          </Button>
          <Button onClick={publish} disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Publicar quiz
          </Button>
        </div>
      </TabsContent>
      <TabsContent value="leads">
        <QuizCaptures />
      </TabsContent>
    </Tabs>
  );
}

function QuizCaptures() {
  const [page, setPage] = useState(0);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["lead-quiz-captures", page],
    queryFn: () => fetchQuizLeads({ data: { page } }),
  });
  const retry = useMutation({
    mutationFn: (id: string) => retryQuizLead({ data: { id } }),
    onSuccess: () => {
      toast.success("Tentativa concluída. Confira os status de cada canal.");
      void queryClient.invalidateQueries({ queryKey: ["lead-quiz-captures"] });
    },
    onError: () => toast.error("Não foi possível tentar novamente."),
  });
  const statuses: Record<string, string> = {
    disabled: "Desabilitado",
    pending: "Pendente",
    sending: "Enviando",
    sent: "Enviado",
    failed: "Falhou",
  };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold">Capturas recebidas</h2>
          <p className="text-sm text-muted-foreground">
            Histórico permanente de diagnósticos concluídos e autorizados.
          </p>
        </div>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Atualizar
        </Button>
      </div>
      {query.isPending ? (
        <Loader2 className="size-6 animate-spin" />
      ) : query.isError ? (
        <p role="alert" className="text-destructive">
          Não foi possível consultar. Verifique a conexão e a migração do banco.
        </p>
      ) : !query.data.rows.length ? (
        <p className="rounded-xl border border-border p-8 text-center text-muted-foreground">
          Nenhuma captura nesta página.
        </p>
      ) : (
        query.data.rows.map((lead) => (
          <details key={lead.id} className="rounded-xl border border-border bg-card p-5">
            <summary className="cursor-pointer">
              <span className="font-semibold">{lead.nome}</span>
              <span className="ml-3 text-sm text-muted-foreground">
                {lead.profile} · {new Date(lead.createdAt).toLocaleString("pt-BR")}
              </span>
            </summary>
            <div className="mt-5 space-y-4 text-sm">
              <p>
                {lead.email} ·{" "}
                <a
                  className="text-primary underline"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://wa.me/${lead.whatsapp.length <= 11 ? "55" : ""}${lead.whatsapp}`}
                >
                  {lead.whatsapp}
                </a>
              </p>
              <dl className="space-y-3">
                {lead.responses.map((answer, index) => (
                  <div key={index}>
                    <dt className="text-muted-foreground">{answer.pergunta}</dt>
                    <dd className="font-medium">{answer.resposta}</dd>
                  </div>
                ))}
              </dl>
              <div className="rounded-lg bg-muted/40 p-4 space-y-2">
                <p>
                  WhatsApp: <strong>{statuses[lead.whatsappStatus] ?? lead.whatsappStatus}</strong>
                  {lead.whatsappError ? ` — ${lead.whatsappError}` : ""}
                </p>
                <p>
                  Webhook: <strong>{statuses[lead.webhookStatus] ?? lead.webhookStatus}</strong>
                  {lead.webhookError ? ` — ${lead.webhookError}` : ""}
                </p>
                {[lead.whatsappStatus, lead.webhookStatus].some((value) =>
                  ["pending", "failed", "sending"].includes(value),
                ) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate(lead.id)}
                  >
                    Tentar envios pendentes / falhos
                  </Button>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Uma requisição ainda em andamento só pode ser recuperada após 5 minutos. Canais
                  enviados não serão repetidos.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Autorização registrada: {lead.consentText}
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted/40 p-4 text-xs">
                {JSON.stringify(lead.payload, null, 2)}
              </pre>
              <p className="text-xs text-muted-foreground">
                ID: {lead.id} · Revisão: {lead.revision}
              </p>
            </div>
          </details>
        ))
      )}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={!page || query.isPending}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </Button>
        <span className="text-sm text-muted-foreground">Página {page + 1}</span>
        <Button
          variant="outline"
          disabled={!query.data?.hasNext || query.isPending}
          onClick={() => setPage(page + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
