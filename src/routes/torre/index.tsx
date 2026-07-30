import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Database,
  HardDrive,
  Loader2,
  Tv,
  Users,
  Wifi,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchInfraStatus, fetchPlatformOverview } from "@/lib/admin/platform.functions";

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
  const { data: infra } = useQuery({
    queryKey: ["platform-infra"],
    queryFn: () => fetchInfraStatus(),
    refetchInterval: 30_000,
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

  const checks = infra
    ? [
        {
          icon: Database,
          label: "Banco de dados (Postgres)",
          ready: infra.databaseReady && infra.schemaReady,
          hint: "Configure DATABASE_URL apontando para o Postgres da VPS.",
        },
        {
          icon: HardDrive,
          label: "Armazenamento de mídias (MinIO)",
          ready: infra.storageReady,
          hint:
            infra.storageError ??
            "Confira S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY e S3_SECRET_KEY na stack.",
        },
      ]
    : [];

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

      {checks.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Status da infraestrutura</CardTitle>
            <CardDescription>
              Verificação automática das conexões da plataforma. Visível apenas para a equipe MDI
              360.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {checks.map((check) => (
              <div
                key={check.label}
                className="flex items-start gap-3 rounded-lg border border-border p-3"
              >
                <check.icon className="mt-0.5 size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{check.label}</p>
                  {!check.ready ? (
                    <p className="mt-1 text-xs text-muted-foreground">{check.hint}</p>
                  ) : null}
                </div>
                {check.ready ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-signal-online">
                    <CheckCircle2 className="size-4" />
                    Conectado
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-signal-warning">
                    <AlertTriangle className="size-4" />
                    Pendente
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}