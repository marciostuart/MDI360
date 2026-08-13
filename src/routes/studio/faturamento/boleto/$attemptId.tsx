import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchBoletoReceipt } from "@/lib/billing/billing.functions";

export const Route = createFileRoute("/studio/faturamento/boleto/$attemptId")({
  component: BoletoReceiptPage,
});

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function BoletoReceiptPage() {
  const { attemptId } = Route.useParams();
  const { data, isPending, isError } = useQuery({
    queryKey: ["boleto-receipt", attemptId],
    queryFn: () => fetchBoletoReceipt({ data: { attemptId } }),
  });

  if (isPending) return <div className="grid place-items-center py-20"><Loader2 className="size-6 animate-spin" /></div>;
  if (isError || !data) return <Card><CardHeader><CardTitle>Boleto não encontrado</CardTitle></CardHeader></Card>;

  return (
    <div className="mx-auto max-w-3xl space-y-5 print:max-w-none">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Button asChild variant="ghost"><Link to="/studio/faturamento"><ArrowLeft className="mr-2 size-4" />Voltar</Link></Button>
        <Button onClick={() => window.print()}><Printer className="mr-2 size-4" />Imprimir</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Boleto MDI 360</CardTitle>
          <CardDescription>Use a linha digitável abaixo no aplicativo ou site do seu banco.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Info label="Valor" value={money.format(data.amountCents / 100)} />
            <Info label="Emissão" value={date.format(new Date(data.createdAt))} />
            <Info label="Situação" value={data.status} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Linha digitável</p>
            <div className="flex gap-2">
              <Input className="font-mono" readOnly value={data.digitableLine ?? ""} />
              <Button className="print:hidden" variant="outline" onClick={() => {
                void navigator.clipboard.writeText(data.digitableLine ?? "");
                toast.success("Linha digitável copiada.");
              }}><Copy className="size-4" /></Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            A liberação ocorre automaticamente após a confirmação do Mercado Pago. Não é necessário enviar comprovante.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>;
}
