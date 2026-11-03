import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Copy, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";

import { CardCheckout } from "@/components/billing/card-checkout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { fetchCustomerProfile } from "@/lib/billing/customer-profile.functions";

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
const date = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const STATUS: Record<string, string> = {
  open: "Aberta",
  paid: "Paga",
  overdue: "Vencida",
  void: "Cancelada",
};

type Attempt = Awaited<ReturnType<typeof createPaymentAttempt>>;
function BillingPage() {
  const queryClient = useQueryClient();
  const createAttemptFn = useServerFn(createPaymentAttempt);
  const refreshAttemptFn = useServerFn(refreshPaymentAttempt);
  const changeClosingDayFn = useServerFn(changeBillingClosingDay);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["postpaid-billing"],
    queryFn: () => fetchPostpaidBilling(),
    refetchInterval: 30_000,
  });
  const customerProfile = useQuery({
    queryKey: ["customer-profile"],
    queryFn: () => fetchCustomerProfile(),
  });
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [closingDay, setClosingDay] = useState("5");

  const create = useMutation({
    mutationFn: (input: { method: "pix" }) => createAttemptFn({ data: input }),
    onSuccess: (result) => {
      setAttempt(result);
      void queryClient.invalidateQueries({ queryKey: ["postpaid-billing"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a cobrança."),
  });

  useEffect(() => {
    if (data?.organization?.closingDay) setClosingDay(String(data.organization.closingDay));
  }, [data?.organization?.closingDay]);

  useEffect(() => {
    if (data) setAttempt(data.activeAttempt ?? null);
  }, [data]);

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
      void refreshAttemptFn({ data: { attemptId: attempt.id } })
        .then((result) => {
          if (!result) return;
          setAttempt(result);
          if (result.status === "approved") {
            toast.success("Pagamento confirmado. Obrigado!");
            void queryClient.invalidateQueries({ queryKey: ["postpaid-billing"] });
            void queryClient.invalidateQueries({ queryKey: ["current-user"] });
          }
        })
        .catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [attempt?.id, attempt?.status, queryClient, refreshAttemptFn]);

  if (isPending)
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  if (!data?.organization) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Faturamento indisponível</CardTitle>
          <CardDescription>
            {error instanceof Error
              ? "Não foi possível consultar os dados financeiros. Tente novamente."
              : "Não encontramos os dados de faturamento desta conta."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const enabled = data.organization.enabled;
  const outstanding = data.outstandingCents;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Faturamento</h1>
        <p className="text-sm text-muted-foreground">
          Consulte suas faturas e pague com Pix pela Central de Cobranças Pay 360BH.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Summary label="Saldo em aberto" value={money.format(outstanding / 100)} />
        <Summary
          label="Próximo fechamento"
          value={data.nextClosingAt ? date.format(new Date(data.nextClosingAt)) : "Não definido"}
        />
        <Summary
          label="Situação"
          value={
            data.organization.subscriptionStatus === "suspended"
              ? "Serviço suspenso"
              : enabled
                ? "Ativa"
                : "Cobrança não ativada"
          }
        />
      </div>

      {!enabled ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Cobrança automática ainda não ativada</CardTitle>
            <CardDescription>
              Seu histórico continuará disponível aqui quando um plano pós-pago for ativado.
            </CardDescription>
          </CardHeader>
        </Card>
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 5, 10, 15, 20].map((day) => (
                    <SelectItem key={day} value={String(day)}>
                      Dia {String(day).padStart(2, "0")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              disabled={updateClosingDay.isPending}
              onClick={() => updateClosingDay.mutate()}
            >
              Agendar mudança
            </Button>
            {data.organization.pendingClosingDay ? (
              <p className="pb-2 text-sm text-muted-foreground">
                Alteração pendente: dia{" "}
                {String(data.organization.pendingClosingDay).padStart(2, "0")}.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {outstanding > 0 ? (
        <section id="pagar-saldo" className="scroll-mt-6 space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Pagar saldo</h2>
            <p className="text-sm text-muted-foreground">
              O pagamento quitará todas as faturas abertas e vencidas listadas abaixo.
            </p>
          </div>
          {customerProfile.isPending ? (
            <Card>
              <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Verificando cadastro financeiro...
              </CardContent>
            </Card>
          ) : !customerProfile.data?.complete ? (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardHeader>
                <CardTitle>Complete seu cadastro para pagar</CardTitle>
                <CardDescription>
                  Precisamos dos dados do responsável financeiro para enviar a cobrança com
                  segurança e aumentar a chance de aprovação.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link to="/studio/cadastro">Completar cadastro</Link>
                </Button>
              </CardContent>
            </Card>
          ) : attempt?.status === "approved" ? (
            <Card className="border-primary/40">
              <CardContent className="flex items-center gap-3 pt-6">
                <CheckCircle2 className="size-6 text-primary" />
                <div>
                  <p className="font-semibold">Pagamento confirmado</p>
                  <p className="text-sm text-muted-foreground">
                    As faturas foram atualizadas automaticamente.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>{data.paymentReady ? (
            <Card>
              <CardHeader>
                <CardTitle>Pix pela Central Pay 360BH</CardTitle>
                <CardDescription>
                  A confirmação chega pelo webhook seguro da Central. A API atual aceita Pix, com valor mínimo de R$ 5,00.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {attempt?.status === "creating" ? (
                  <p className="text-sm text-muted-foreground">
                    A Central está processando esta referência. Para evitar uma cobrança duplicada,
                    não gere outro Pix enquanto o resultado dessa solicitação estiver incerto.
                  </p>
                ) : attempt?.method === "pix" && attempt.qrCode ? (
                  <PixAttempt attempt={attempt} />
                ) : outstanding < 500 ? (
                  <p className="text-sm text-muted-foreground">
                    O saldo precisa atingir R$ 5,00 para gerar uma cobrança Pix. O valor em aberto será acumulado nas próximas faturas.
                  </p>
                ) : (
                  <Button onClick={() => create.mutate({ method: "pix" })} disabled={create.isPending}>
                    {create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Gerar Pix
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Pagamento Pix temporariamente indisponível</CardTitle>
                <CardDescription>
                  A Central Pay 360BH ainda não foi configurada pela equipe MDI 360. Suas faturas continuam registradas; tente novamente mais tarde.
                </CardDescription>
              </CardHeader>
            </Card>
            )}</>
          )}
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Histórico de faturas</CardTitle>
          <CardDescription>Valores congelados no fechamento de cada ciclo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma fatura emitida.</p>
          ) : (
            data.invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div>
                  <p className="font-medium">{invoice.number}</p>
                  <p className="text-xs text-muted-foreground">
                    {date.format(new Date(invoice.periodStart))} a{" "}
                    {date.format(new Date(invoice.periodEnd))} · vence{" "}
                    {date.format(new Date(invoice.dueAt))}
                  </p>
                  {data.invoiceItems
                    .filter((item) => item.invoiceId === invoice.id)
                    .map((item) => (
                      <p key={item.id} className="text-xs text-muted-foreground">
                        {item.description}: {money.format(item.amountCents / 100)}
                      </p>
                    ))}
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      invoice.status === "paid"
                        ? "default"
                        : invoice.status === "overdue"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {STATUS[invoice.status] ?? invoice.status}
                  </Badge>
                  <strong>{money.format(invoice.totalCents / 100)}</strong>
                  <Button asChild size="sm" variant="outline">
                    <a href={`/studio/faturamento/fatura/${invoice.id}`}>Detalhes</a>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="font-display text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
function PixAttempt({ attempt }: { attempt: NonNullable<Attempt> }) {
  return (
    <div className="space-y-3">
      {attempt.qrCodeBase64 ? (
        <img
          className="mx-auto size-56 rounded bg-white p-2"
          alt="QR Code Pix"
          src={`data:image/png;base64,${attempt.qrCodeBase64}`}
        />
      ) : null}
      <div className="flex gap-2">
        <Input readOnly value={attempt.qrCode ?? ""} />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(attempt.qrCode ?? "");
            toast.success("Código Pix copiado.");
          }}
        >
          <Copy className="size-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        A página acompanha a confirmação automaticamente.
      </p>
    </div>
  );
}
