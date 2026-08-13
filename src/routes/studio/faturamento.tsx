import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Copy, CreditCard, FileText, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";

import { CardCheckout } from "@/components/billing/card-checkout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  changeBillingClosingDay,
  createPaymentAttempt,
  fetchPostpaidBilling,
  refreshPaymentAttempt,
} from "@/lib/billing/billing.functions";

export const Route = createFileRoute("/studio/faturamento")({
  head: () => ({
    meta: [
      { title: "Faturamento | MDI 360" },
      { name: "description", content: "Faturas, pagamentos e histórico financeiro do MDI 360." },
    ],
  }),
  component: BillingPage,
});

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });
const STATUS: Record<string, string> = {
  open: "Aberta",
  paid: "Paga",
  overdue: "Vencida",
  void: "Cancelada",
};

type Attempt = Awaited<ReturnType<typeof createPaymentAttempt>>;
type CreateAttemptData =
  | { method: "pix" }
  | { method: "card"; card: { token: string; paymentMethodId: string; documentType?: string; documentNumber?: string } }
  | { method: "boleto"; boleto: { legalName: string; documentType: "CPF" | "CNPJ"; documentNumber: string; zipCode: string; street: string; number: string; neighborhood: string; city: string; state: string } };

function BillingPage() {
  const queryClient = useQueryClient();
  const createAttemptFn = useServerFn(createPaymentAttempt);
  const refreshAttemptFn = useServerFn(refreshPaymentAttempt);
  const changeClosingDayFn = useServerFn(changeBillingClosingDay);
  const { data, isPending } = useQuery({
    queryKey: ["postpaid-billing"],
    queryFn: () => fetchPostpaidBilling(),
    refetchInterval: 30_000,
  });
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [closingDay, setClosingDay] = useState("5");
  const [boleto, setBoleto] = useState({
    legalName: "", documentType: "CPF" as "CPF" | "CNPJ", documentNumber: "",
    zipCode: "", street: "", number: "", neighborhood: "", city: "", state: "",
  });

  const create = useMutation({
    mutationFn: (input: CreateAttemptData) => createAttemptFn({ data: input }),
    onSuccess: (result) => {
      setAttempt(result);
      void queryClient.invalidateQueries({ queryKey: ["postpaid-billing"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível criar a cobrança."),
  });

  useEffect(() => {
    if (data?.organization?.closingDay) setClosingDay(String(data.organization.closingDay));
  }, [data?.organization?.closingDay]);

  const updateClosingDay = useMutation({
    mutationFn: () =>
      changeClosingDayFn({ data: { closingDay: Number(closingDay) as 1 | 5 | 10 | 15 | 20 } }),
    onSuccess: () => {
      toast.success("Novo fechamento agendado para o próximo ciclo.");
      void queryClient.invalidateQueries({ queryKey: ["postpaid-billing"] });
    },
    onError: () => toast.error("Não foi possível alterar o fechamento."),
  });

  useEffect(() => {
    if (!attempt?.id || attempt.status === "approved") return;
    const timer = window.setInterval(() => {
      void refreshAttemptFn({ data: { attemptId: attempt.id } }).then((result) => {
        if (!result) return;
        setAttempt(result);
        if (result.status === "approved") {
          toast.success("Pagamento confirmado. Obrigado!");
          void queryClient.invalidateQueries({ queryKey: ["postpaid-billing"] });
          void queryClient.invalidateQueries({ queryKey: ["current-user"] });
        }
      }).catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [attempt?.id, attempt?.status, queryClient, refreshAttemptFn]);

  if (isPending) return <div className="grid place-items-center py-20"><Loader2 className="size-6 animate-spin" /></div>;
  if (!data?.organization) return <Card><CardHeader><CardTitle>Faturamento indisponível</CardTitle></CardHeader></Card>;

  const enabled = data.organization.enabled;
  const outstanding = data.outstandingCents;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Faturamento</h1>
        <p className="text-sm text-muted-foreground">Consulte faturas e pague com Pix, cartão ou boleto sem sair do MDI 360.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Summary label="Saldo em aberto" value={money.format(outstanding / 100)} />
        <Summary label="Próximo fechamento" value={data.nextClosingAt ? date.format(new Date(data.nextClosingAt)) : "Não definido"} />
        <Summary label="Situação" value={data.organization.subscriptionStatus === "suspended" ? "Serviço suspenso" : enabled ? "Ativa" : "Cobrança não ativada"} />
      </div>

      {!enabled ? (
        <Card className="border-dashed"><CardHeader><CardTitle>Cobrança automática ainda não ativada</CardTitle><CardDescription>Seu histórico continuará disponível aqui quando um plano pós-pago for ativado.</CardDescription></CardHeader></Card>
      ) : null}

      {enabled ? (
        <Card>
          <CardHeader>
            <CardTitle>Dia de fechamento</CardTitle>
            <CardDescription>
              A mudança será aplicada somente depois do fechamento do ciclo atual.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="w-48 space-y-2">
              <Label>Novo dia</Label>
              <Select value={closingDay} onValueChange={setClosingDay}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 5, 10, 15, 20].map((day) => (
                    <SelectItem key={day} value={String(day)}>Dia {String(day).padStart(2, "0")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" disabled={updateClosingDay.isPending} onClick={() => updateClosingDay.mutate()}>
              Agendar mudança
            </Button>
            {data.organization.pendingClosingDay ? (
              <p className="pb-2 text-sm text-muted-foreground">
                Alteração pendente: dia {String(data.organization.pendingClosingDay).padStart(2, "0")}.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {outstanding > 0 ? (
        <section className="space-y-4">
          <div><h2 className="font-display text-xl font-semibold">Pagar saldo</h2><p className="text-sm text-muted-foreground">O pagamento quitará todas as faturas abertas e vencidas listadas abaixo.</p></div>
          {attempt?.status === "approved" ? (
            <Card className="border-primary/40"><CardContent className="flex items-center gap-3 pt-6"><CheckCircle2 className="size-6 text-primary" /><div><p className="font-semibold">Pagamento confirmado</p><p className="text-sm text-muted-foreground">As faturas foram atualizadas automaticamente.</p></div></CardContent></Card>
          ) : (
            <Tabs defaultValue="pix">
              <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="pix"><QrCode className="mr-2 size-4" />Pix</TabsTrigger><TabsTrigger value="card"><CreditCard className="mr-2 size-4" />Cartão</TabsTrigger><TabsTrigger value="boleto"><FileText className="mr-2 size-4" />Boleto</TabsTrigger></TabsList>
              <TabsContent value="pix" className="mt-4">
                <Card><CardHeader><CardTitle>Pix</CardTitle><CardDescription>Confirmação automática normalmente em poucos segundos.</CardDescription></CardHeader><CardContent className="space-y-4">
                  {attempt?.method === "pix" && attempt.qrCode ? <PixAttempt attempt={attempt} /> : <Button onClick={() => create.mutate({ method: "pix" })} disabled={create.isPending}>{create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Gerar Pix</Button>}
                </CardContent></Card>
              </TabsContent>
              <TabsContent value="card" className="mt-4">
                {attempt?.method === "card" && attempt.redirectUrl ? <Card><CardHeader><CardTitle>Confirme o pagamento no banco</CardTitle><CardDescription>Seu banco solicitou autenticação de segurança.</CardDescription></CardHeader><CardContent><Button asChild><a href={attempt.redirectUrl} target="_blank" rel="noreferrer">Continuar autenticação 3DS</a></Button></CardContent></Card> : data.publicKey ? <CardCheckout publicKey={data.publicKey} amountCents={outstanding} onTokenized={async (card) => { await create.mutateAsync({ method: "card", card }); }} /> : <Card><CardHeader><CardTitle>Cartão indisponível</CardTitle><CardDescription>A chave pública do Mercado Pago ainda não foi configurada.</CardDescription></CardHeader></Card>}
              </TabsContent>
              <TabsContent value="boleto" className="mt-4">
                <Card><CardHeader><CardTitle>Boleto bancário</CardTitle><CardDescription>Informe os dados fiscais exigidos para a emissão.</CardDescription></CardHeader><CardContent>
                  {attempt?.method === "boleto" && attempt.ticketUrl ? <BoletoAttempt attempt={attempt} /> : <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); create.mutate({ method: "boleto", boleto }); }}>
                    <Field label="Nome/Razão social" value={boleto.legalName} onChange={(value) => setBoleto((old) => ({ ...old, legalName: value }))} className="sm:col-span-2" />
                    <div className="space-y-2"><Label>Documento</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3" value={boleto.documentType} onChange={(e) => setBoleto((old) => ({ ...old, documentType: e.target.value as "CPF" | "CNPJ" }))}><option>CPF</option><option>CNPJ</option></select></div>
                    <Field label="Número do documento" value={boleto.documentNumber} onChange={(value) => setBoleto((old) => ({ ...old, documentNumber: value }))} />
                    <Field label="CEP" value={boleto.zipCode} onChange={(value) => setBoleto((old) => ({ ...old, zipCode: value }))} />
                    <Field label="Endereço" value={boleto.street} onChange={(value) => setBoleto((old) => ({ ...old, street: value }))} />
                    <Field label="Número" value={boleto.number} onChange={(value) => setBoleto((old) => ({ ...old, number: value }))} />
                    <Field label="Bairro" value={boleto.neighborhood} onChange={(value) => setBoleto((old) => ({ ...old, neighborhood: value }))} />
                    <Field label="Cidade" value={boleto.city} onChange={(value) => setBoleto((old) => ({ ...old, city: value }))} />
                    <Field label="UF" value={boleto.state} onChange={(value) => setBoleto((old) => ({ ...old, state: value.toUpperCase() }))} />
                    <Button type="submit" className="sm:col-span-2" disabled={create.isPending}>Gerar boleto</Button>
                  </form>}
                </CardContent></Card>
              </TabsContent>
            </Tabs>
          )}
        </section>
      ) : null}

      <Card><CardHeader><CardTitle>Histórico de faturas</CardTitle><CardDescription>Valores congelados no fechamento de cada ciclo.</CardDescription></CardHeader><CardContent className="space-y-2">
        {data.invoices.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma fatura emitida.</p> : data.invoices.map((invoice) => (
          <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"><div><p className="font-medium">{invoice.number}</p><p className="text-xs text-muted-foreground">{date.format(new Date(invoice.periodStart))} a {date.format(new Date(invoice.periodEnd))} · vence {date.format(new Date(invoice.dueAt))}</p>{data.invoiceItems.filter((item) => item.invoiceId === invoice.id).map((item) => <p key={item.id} className="text-xs text-muted-foreground">{item.description}: {money.format(item.amountCents / 100)}</p>)}</div><div className="flex items-center gap-3"><Badge variant={invoice.status === "paid" ? "default" : invoice.status === "overdue" ? "destructive" : "secondary"}>{STATUS[invoice.status] ?? invoice.status}</Badge><strong>{money.format(invoice.totalCents / 100)}</strong><Button asChild size="sm" variant="outline"><a href={`/studio/faturamento/fatura/${invoice.id}`}>Detalhes</a></Button></div></div>
        ))}
      </CardContent></Card>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) { return <Card><CardHeader className="pb-2"><CardDescription>{label}</CardDescription></CardHeader><CardContent><p className="font-display text-xl font-semibold">{value}</p></CardContent></Card>; }
function Field({ label, value, onChange, className }: { label: string; value: string; onChange: (value: string) => void; className?: string }) { return <div className={`space-y-2 ${className ?? ""}`}><Label>{label}</Label><Input required value={value} onChange={(event) => onChange(event.target.value)} /></div>; }
function PixAttempt({ attempt }: { attempt: NonNullable<Attempt> }) { return <div className="space-y-3">{attempt.qrCodeBase64 ? <img className="mx-auto size-56 rounded bg-white p-2" alt="QR Code Pix" src={`data:image/png;base64,${attempt.qrCodeBase64}`} /> : null}<div className="flex gap-2"><Input readOnly value={attempt.qrCode ?? ""} /><Button type="button" variant="outline" onClick={() => { void navigator.clipboard.writeText(attempt.qrCode ?? ""); toast.success("Código Pix copiado."); }}><Copy className="size-4" /></Button></div><p className="text-xs text-muted-foreground">A página acompanha a confirmação automaticamente.</p></div>; }
function BoletoAttempt({ attempt }: { attempt: NonNullable<Attempt> }) { return <div className="space-y-3"><div className="flex gap-2"><Input readOnly value={attempt.digitableLine ?? ""} /><Button variant="outline" type="button" onClick={() => void navigator.clipboard.writeText(attempt.digitableLine ?? "")}><Copy className="size-4" /></Button></div><Button asChild><a href={`/studio/faturamento/boleto/${attempt.id}`}>Abrir boleto para impressão</a></Button></div>; }
