import { createFileRoute } from "@tanstack/react-router";

import { Pay360BhAdminCard } from "@/components/billing/pay360bh-admin-card";

export const Route = createFileRoute("/torre/pagamentos")({
  head: () => ({ meta: [{ title: "Pagamentos | Torre MDI 360" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Central de pagamentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          As novas cobranças do MDI 360 são processadas exclusivamente pela Central Pay 360BH.
        </p>
      </header>
      <Pay360BhAdminCard />
      <p className="text-xs text-muted-foreground">
        Cobranças antigas já emitidas por outro provedor continuam com sua conciliação histórica;
        nenhuma nova cobrança de cliente será criada por esse fluxo.
      </p>
    </main>
  );
}
