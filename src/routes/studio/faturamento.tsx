import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CreditCard, Loader2, MinusCircle, PlusCircle, Tv } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchBilling } from "@/lib/billing/billing.functions";
import { formatMoney } from "@/lib/admin/format";

export const Route = createFileRoute("/studio/faturamento")({
  head: () => ({
    meta: [
      { title: "Faturamento | MDI 360" },
      {
        name: "description",
        content:
          "Acompanhe a cobrança por tela do MDI 360: valores proporcionais por dia, créditos de telas removidas e total do ciclo atual.",
      },
      { property: "og:title", content: "Faturamento por tela | MDI 360" },
      {
        property: "og:description",
        content: "Cobrança proporcional por tela ativa, com créditos automáticos por desvínculo.",
      },
    ],
  }),
  component: BillingPage,
});

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });

function formatDay(value: string) {
  return dateFormat.format(new Date(value));
}

function BillingPage() {
  const { data, isPending } = useQuery({ queryKey: ["billing"], queryFn: () => fetchBilling() });

  if (isPending) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Faturamento indisponível</CardTitle>
          <CardDescription>Entre novamente para consultar sua fatura.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Faturamento</h1>
        <p className="text-sm text-muted-foreground">
          {data.perDeviceBilling
            ? "Você paga por tela ativa. Telas ativadas ou removidas no meio do ciclo são calculadas proporcionalmente aos dias restantes."
            : "Seu plano é gratuito: nenhuma cobrança é gerada. O armazenamento é compartilhado por toda a conta."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CreditCard className="size-4" /> Total do ciclo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold">{formatMoney(data.totalCents)}</p>
            <p className="text-xs text-muted-foreground">
              Vencimento em {formatDay(data.cycleEnd)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Tv className="size-4" /> Telas ativas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold">{data.activeDevices}</p>
            <p className="text-xs text-muted-foreground">
              {data.perDeviceBilling
                ? `${formatMoney(data.unitPriceCents)} por tela/mês`
                : "Plano gratuito"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <PlusCircle className="size-4" /> Mensalidade cheia
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold">
              {formatMoney(data.recurringCents)}
            </p>
            <p className="text-xs text-muted-foreground">
              Valor do próximo ciclo mantendo as telas atuais
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CalendarClock className="size-4" /> Ciclo atual
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold">{data.daysRemaining} dias</p>
            <p className="text-xs text-muted-foreground">
              {formatDay(data.cycleStart)} → {formatDay(data.cycleEnd)} ({data.cycleDays} dias)
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalhamento do ciclo</CardTitle>
          <CardDescription>
            Cada linha mostra a tela, os dias cobrados e o cálculo proporcional aplicado.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data.entries.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Nenhum lançamento neste ciclo.
            </p>
          ) : (
            <div className="divide-y divide-border border-t border-border">
              {data.entries.map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-[220px] flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      {entry.kind === "credit" ? (
                        <MinusCircle className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <PlusCircle className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate text-sm font-medium">{entry.deviceName}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={entry.kind === "credit" ? "secondary" : "default"}>
                        {entry.kind === "credit" ? "Crédito por desvínculo" : "Tela ativa"}
                      </Badge>
                      <Badge variant="outline">
                        {entry.days} de {entry.cycleDays} dias
                      </Badge>
                      <Badge variant="outline">
                        {formatMoney(entry.unitPriceCents)}/mês
                      </Badge>
                      <Badge variant="outline">
                        {entry.kind === "credit" ? "A partir de " : "Desde "}
                        {formatDay(entry.chargedFrom)}
                      </Badge>
                    </div>
                  </div>
                  <p
                    className={`font-display text-lg font-semibold ${
                      entry.amountCents < 0 ? "text-muted-foreground" : ""
                    }`}
                  >
                    {entry.amountCents < 0 ? "− " : ""}
                    {formatMoney(Math.abs(entry.amountCents))}
                  </p>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="text-sm text-muted-foreground">
                  Cobranças {formatMoney(data.chargesCents)} · Créditos{" "}
                  {formatMoney(Math.abs(data.creditsCents))}
                </div>
                <p className="font-display text-xl font-semibold">
                  Total {formatMoney(data.totalCents)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        O armazenamento do plano é global da conta — não é cobrado por tela.
      </p>
    </div>
  );
}
