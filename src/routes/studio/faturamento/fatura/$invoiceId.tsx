import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchInvoiceReceipt } from "@/lib/billing/billing.functions";

export const Route = createFileRoute("/studio/faturamento/fatura/$invoiceId")({
  component: InvoiceReceiptPage,
});

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

function InvoiceReceiptPage() {
  const { invoiceId } = Route.useParams();
  const { data, isPending } = useQuery({
    queryKey: ["billing-invoice", invoiceId],
    queryFn: () => fetchInvoiceReceipt({ data: { invoiceId } }),
  });

  if (isPending || !data) return <p className="p-6 text-sm text-muted-foreground">Carregando fatura...</p>;
  return (
    <div className="mx-auto max-w-3xl space-y-4 py-6">
      <div className="flex justify-between print:hidden">
        <Button asChild variant="outline"><a href="/studio/faturamento"><ArrowLeft className="mr-2 size-4" />Voltar</a></Button>
        <Button onClick={() => window.print()}><Printer className="mr-2 size-4" />Imprimir</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Fatura {data.invoice.number}</CardTitle>
          <CardDescription>Período de {date.format(new Date(data.invoice.periodStart))} a {date.format(new Date(data.invoice.periodEnd))}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.items.map((item) => <div key={item.id} className="flex justify-between border-b border-border pb-2 text-sm"><span>{item.description}</span><strong>{money.format(item.amountCents / 100)}</strong></div>)}
          <div className="flex justify-between text-lg"><span>Total</span><strong>{money.format(data.invoice.totalCents / 100)}</strong></div>
          <p className="text-sm">Situação: <strong>{data.invoice.status}</strong> · vencimento em {date.format(new Date(data.invoice.dueAt))}</p>
          {data.attempts.filter((attempt) => attempt.status === "approved").map((attempt) => (
            <div key={attempt.id} className="rounded border border-border p-3 text-sm">
              Pagamento confirmado por {attempt.method.toUpperCase()}
              {attempt.approvedAt ? ` em ${date.format(new Date(attempt.approvedAt))}` : ""}
              {attempt.providerPaymentId ? ` · referência ${attempt.providerPaymentId}` : ""}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
