import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  TestTube2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { CardCheckout } from "@/components/billing/card-checkout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  cancelSandboxPayment,
  createSandboxPayment,
  fetchSandboxPayments,
  refreshSandboxPayment,
} from "@/lib/admin/sandbox-payments.functions";

export const Route = createFileRoute("/torre/pagamentos-testes")({
  head: () => ({ meta: [{ title: "Testes de pagamento | Torre MDI 360" }] }),
  component: SandboxPaymentsPage,
});

type SandboxTest = Awaited<ReturnType<typeof createSandboxPayment>>;
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" });

function SandboxPaymentsPage() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["sandbox-payments"],
    queryFn: () => fetchSandboxPayments(),
  });
  const [amountValue, setAmountValue] = useState("50,00");
  const [current, setCurrent] = useState<SandboxTest | null>(null);
  const amountCents = useMemo(() => {
    const normalized = amountValue.replace(/\./g, "").replace(",", ".");
    return Math.round(Number(normalized) * 100);
  }, [amountValue]);

  const create = useMutation({
    mutationFn: (input: Parameters<typeof createSandboxPayment>[0]["data"]) =>
      createSandboxPayment({ data: input }),
    onSuccess: (result) => {
      setCurrent(result);
      void queryClient.invalidateQueries({ queryKey: ["sandbox-payments"] });
      toast.success("Ordem Sandbox criada.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha no teste."),
  });
  const { mutate: refreshPayment } = useMutation({
    mutationFn: (id: string) => refreshSandboxPayment({ data: { id } }),
    onSuccess: (result) => {
      setCurrent(result);
      void queryClient.invalidateQueries({ queryKey: ["sandbox-payments"] });
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelSandboxPayment({ data: { id } }),
    onSuccess: (result) => {
      setCurrent(result);
      void queryClient.invalidateQueries({ queryKey: ["sandbox-payments"] });
      toast.success("Teste cancelado.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao cancelar."),
  });

  useEffect(() => {
    if (!current?.id || !["creating", "pending"].includes(current.status)) return;
    const timer = window.setInterval(() => refreshPayment(current.id), 5_000);
    return () => window.clearInterval(timer);
  }, [current?.id, current?.status, refreshPayment]);

  if (isPending || !data) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const validAmount = Number.isInteger(amountCents) && amountCents >= 100 && amountCents <= 100_000;
  const checks = [
    {
      label: "Pix aprovado",
      done: data.tests.some((test) => test.method === "pix" && test.status === "approved"),
    },
    {
      label: "Cartão aprovado",
      done: data.tests.some((test) => test.method === "card" && test.status === "approved"),
    },
    {
      label: "Cartão recusado",
      done: data.tests.some(
        (test) => test.method === "card" && ["rejected", "failed"].includes(test.status),
      ),
    },
    {
      label: "Boleto gerado",
      done: data.tests.some((test) => test.method === "boleto" && Boolean(test.ticketUrl)),
    },
    {
      label: "Webhook validado",
      done: data.tests.some((test) => Boolean(test.webhookReceivedAt)),
    },
  ];
  const completedChecks = checks.filter((check) => check.done).length;
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" className="mb-3 -ml-3">
          <Link to="/torre/pagamentos">
            <ArrowLeft className="mr-2 size-4" />
            Pagamentos
          </Link>
        </Button>
        <h1 className="font-display text-3xl font-semibold">Laboratório de pagamentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ordens isoladas usando exclusivamente as credenciais Sandbox. Elas não criam, quitam ou
          alteram faturas de clientes.
        </p>
      </div>

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube2 className="size-5" />
            Ambiente seguro de testes
          </CardTitle>
          <CardDescription>
            Os e-mails técnicos e cenários exigidos pelo Mercado Pago são aplicados automaticamente.
            Nunca use cartão real nesta página.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className={completedChecks === checks.length ? "border-primary/50" : undefined}>
        <CardHeader>
          <CardTitle>
            Homologação Sandbox: {completedChecks} de {checks.length}
          </CardTitle>
          <CardDescription>
            Só altere a integração para produção depois que todos os cenários abaixo estiverem
            concluídos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {checks.map((check) => (
            <div
              key={check.label}
              className="flex items-center gap-2 rounded-lg border p-3 text-sm"
            >
              {check.done ? (
                <CheckCircle2 className="size-4 shrink-0 text-primary" />
              ) : (
                <XCircle className="size-4 shrink-0 text-muted-foreground" />
              )}
              {check.label}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Novo teste</CardTitle>
          <CardDescription>
            Para o Pix oficial de teste, mantenha preferencialmente R$ 50,00.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="max-w-xs space-y-2">
            <Label>Valor simulado</Label>
            <Input
              value={amountValue}
              onChange={(event) => setAmountValue(event.target.value)}
              inputMode="decimal"
            />
            <p className="text-xs text-muted-foreground">Permitido: R$ 1,00 a R$ 1.000,00.</p>
          </div>
          <Tabs defaultValue="pix">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pix">Pix</TabsTrigger>
              <TabsTrigger value="card">Cartão</TabsTrigger>
              <TabsTrigger value="boleto">Boleto</TabsTrigger>
            </TabsList>
            <TabsContent value="pix" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                O cenário APRO começa aguardando transferência e deve mudar automaticamente para
                aprovado.
              </p>
              <Button
                disabled={!validAmount || create.isPending}
                onClick={() => create.mutate({ method: "pix", amountCents })}
              >
                {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Criar Pix de
                teste
              </Button>
            </TabsContent>
            <TabsContent value="card" className="mt-4 space-y-4">
              <Card className="bg-muted/30">
                <CardContent className="pt-6 text-sm">
                  <p>
                    <strong>Aprovado:</strong> Mastercard 5480 8328 0103 3311, validade 11/30, CVV
                    123, titular APRO, CPF 12345678909.
                  </p>
                  <p className="mt-2">
                    <strong>Recusado:</strong> use o mesmo cartão e titular OTHE.
                  </p>
                </CardContent>
              </Card>
              {validAmount ? (
                <CardCheckout
                  publicKey={data.publicKey}
                  amountCents={amountCents}
                  onTokenized={async (card) => {
                    await create.mutateAsync({ method: "card", amountCents, card });
                  }}
                />
              ) : (
                <p className="text-sm text-destructive">Informe um valor válido.</p>
              )}
            </TabsContent>
            <TabsContent value="boleto" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                O teste valida a geração do boleto. No Sandbox ele permanece aguardando pagamento
                por definição do Mercado Pago.
              </p>
              <Button
                disabled={!validAmount || create.isPending}
                onClick={() => create.mutate({ method: "boleto", amountCents })}
              >
                Criar boleto de teste
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {current ? (
        <TestResult
          test={current}
          onRefresh={() => refreshPayment(current.id)}
          onCancel={() => cancel.mutate(current.id)}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Histórico Sandbox</CardTitle>
          <CardDescription>
            Últimos 50 testes, separados do financeiro dos clientes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.tests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum teste realizado.</p>
          ) : (
            data.tests.map((test) => (
              <button
                key={test.id}
                type="button"
                onClick={() => setCurrent(test)}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-muted/50"
              >
                <span>
                  <strong className="uppercase">{test.method}</strong>
                  <small className="ml-3 text-muted-foreground">
                    {dateTime.format(new Date(test.createdAt))}
                  </small>
                </span>
                <span className="flex items-center gap-3">
                  <StatusBadge status={test.status} />
                  <strong>{currency.format(test.amountCents / 100)}</strong>
                </span>
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TestResult({
  test,
  onRefresh,
  onCancel,
}: {
  test: NonNullable<SandboxTest>;
  onRefresh: () => void;
  onCancel: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Resultado <StatusBadge status={test.status} />
        </CardTitle>
        <CardDescription>
          {test.statusDetail || "Aguardando atualização do Mercado Pago."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <p>
            <span className="text-muted-foreground">Método:</span> {test.method.toUpperCase()}
          </p>
          <p>
            <span className="text-muted-foreground">Valor:</span>{" "}
            {currency.format(test.amountCents / 100)}
          </p>
          <p>
            <span className="text-muted-foreground">Webhook:</span>{" "}
            {test.webhookReceivedAt ? "recebido e validado" : "ainda não recebido"}
          </p>
        </div>
        {test.providerOrderId ? (
          <div className="space-y-2">
            <CopyField value={test.providerOrderId} label="ID da Order no Mercado Pago" />
            <p className="text-xs text-muted-foreground">
              Use este ID como Data ID ao simular uma notificação do evento Order no Mercado Pago.
            </p>
          </div>
        ) : null}
        {test.qrCodeBase64 ? (
          <img
            className="mx-auto size-56 rounded bg-white p-2"
            src={`data:image/png;base64,${test.qrCodeBase64}`}
            alt="QR Code Pix Sandbox"
          />
        ) : null}
        {test.qrCode ? <CopyField value={test.qrCode} label="Pix copia e cola" /> : null}
        {test.digitableLine ? (
          <CopyField value={test.digitableLine} label="Linha digitável" />
        ) : null}
        {test.ticketUrl ? (
          <Button asChild variant="outline">
            <a href={test.ticketUrl} target="_blank" rel="noreferrer">
              Abrir comprovante Sandbox
            </a>
          </Button>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onRefresh}>
            <RefreshCw className="mr-2 size-4" />
            Consultar agora
          </Button>
          {["creating", "pending"].includes(test.status) ? (
            <Button variant="destructive" onClick={onCancel}>
              Cancelar teste
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function CopyField({ value, label }: { value: string; label: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} />
        <Button
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success("Copiado.");
          }}
        >
          <Copy className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const approved = status === "approved";
  const failed = ["failed", "rejected", "canceled", "cancelled", "expired"].includes(status);
  return (
    <Badge variant={approved ? "default" : failed ? "destructive" : "secondary"}>
      {approved ? (
        <CheckCircle2 className="mr-1 size-3" />
      ) : failed ? (
        <XCircle className="mr-1 size-3" />
      ) : null}
      {status}
    </Badge>
  );
}
