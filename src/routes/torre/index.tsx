import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Loader2, Tv, Users, Wifi } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchPlatformOverview } from "@/lib/admin/platform.functions";

export const Route = createFileRoute("/torre/")({
  head: () => ({
    meta: [
      { title: "Torre de Controle | MDI 360" },
      {
        name: "description",
        content: "Área interna da plataforma MDI 360: contas, telas ativas e faturamento por tela.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Torre de Controle MDI 360" },
      { property: "og:description", content: "Área interna da plataforma MDI 360." },
    ],
  }),
  component: TowerOverview,
});

function TowerOverview() {
  const { data, isPending } = useQuery({
    queryKey: ["platform-overview"],
    queryFn: () => fetchPlatformOverview(),
    staleTime: 15_000,
  });

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
          <CardTitle className="text-xl">Área indisponível</CardTitle>
          <CardDescription>
            Esta página é restrita à equipe da plataforma. Entre com uma conta autorizada em
            PLATFORM_ADMIN_EMAILS para visualizar os dados.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const cards = [
    { icon: Building2, label: "Contas de clientes", value: data.organizations },
    { icon: Users, label: "Usuários cadastrados", value: data.users },
    { icon: Tv, label: "Telas cadastradas", value: data.devices },
    { icon: Wifi, label: "Telas ativas (faturáveis)", value: data.activeDevices },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Torre de Controle</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Visão consolidada da plataforma. A cobrança do SaaS acompanha o número de telas ativas de
          cada cliente.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-4">
              <card.icon className="size-5 text-primary" />
              <CardDescription className="mt-2">{card.label}</CardDescription>
              <CardTitle className="text-3xl">{card.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}