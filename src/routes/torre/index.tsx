import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Database,
  Gauge,
  HardDrive,
  Loader2,
  Radio,
  Tv,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchInfraStatus,
  fetchPlatformOrganizations,
  fetchPlatformOverview,
} from "@/lib/admin/platform.functions";
import { formatBytes } from "@/lib/admin/format";
import { TrafficMonitor } from "@/components/admin/traffic-monitor";

export const Route = createFileRoute("/torre/")({
  head: () => ({
    meta: [
      { title: "Torre de Controle | MDI 360" },
      {
        name: "description",
        content:
          "Painel da plataforma MDI 360: contas, telas vinculadas, armazenamento e carga do servidor.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Torre de Controle MDI 360" },
      { property: "og:description", content: "Área interna da plataforma MDI 360." },
    ],
  }),
  component: TowerOverview,
});

const CARD_TONES = [
  "from-sky-500/20 to-sky-500/0 text-sky-500",
  "from-emerald-500/20 to-emerald-500/0 text-emerald-500",
  "from-violet-500/20 to-violet-500/0 text-violet-500",
  "from-amber-500/20 to-amber-500/0 text-amber-500",
  "from-rose-500/20 to-rose-500/0 text-rose-500",
  "from-cyan-500/20 to-cyan-500/0 text-cyan-500",
];

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Tv;
  label: string;
  value: string;
  hint?: string;
  tone: string;
}) {
  return (
    <Card className="relative overflow-hidden transition-transform duration-300 hover:-translate-y-1">
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tone.split(" text-")[0]}`}
      />
      <CardHeader className="relative flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className={`size-4 ${tone.split(" ").pop()}`} />
      </CardHeader>
      <CardContent className="relative">
        <p className="font-display text-3xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function TowerOverview() {
  const { data, isPending } = useQuery({
    queryKey: ["platform-overview"],
    queryFn: () => fetchPlatformOverview(),
    refetchInterval: 10_000,
  });
  const { data: infra } = useQuery({
    queryKey: ["platform-infra"],
    queryFn: () => fetchInfraStatus(),
    refetchInterval: 30_000,
  });
  const { data: orgs } = useQuery({
    queryKey: ["platform-organizations"],
    queryFn: () => fetchPlatformOrganizations(),
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

  const topStorage = [...(orgs ?? [])].sort((a, b) => b.storageBytes - a.storageBytes).slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Torre de Controle</h1>
          <p className="text-sm text-muted-foreground">
            Dados em tempo real da plataforma — atualiza sozinho a cada 10 segundos.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-500">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Ao vivo
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          icon={Tv}
          label="Telas vinculadas"
          value={String(data.linkedDevices)}
          hint={`${data.onlineDevices} online agora`}
          tone={CARD_TONES[0]}
        />
        <MetricCard
          icon={Building2}
          label="Estabelecimentos"
          value={String(data.organizations)}
          hint={`${data.users} usuários cadastrados`}
          tone={CARD_TONES[1]}
        />
        <MetricCard
          icon={HardDrive}
          label="Armazenamento usado"
          value={formatBytes(data.storageBytes)}
          hint={`${data.mediaAssets} arquivos de mídia`}
          tone={CARD_TONES[2]}
        />
        <MetricCard
          icon={Radio}
          label="Telas aguardando vínculo"
          value={String(data.pendingDevices)}
          hint="Códigos gerados e ainda não reivindicados"
          tone={CARD_TONES[3]}
        />
        <MetricCard
          icon={Activity}
          label="Requisições (24h)"
          value={data.requests24h.toLocaleString("pt-BR")}
          hint="Chamadas dos players e do painel"
          tone={CARD_TONES[4]}
        />
        <MetricCard
          icon={Gauge}
          label="Tráfego (24h)"
          value={formatBytes(data.traffic24hBytes)}
          hint="Entrada + saída medida no servidor"
          tone={CARD_TONES[5]}
        />
      </div>

      <TrafficMonitor />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Maiores consumos de disco</CardTitle>
              <CardDescription>Top 5 estabelecimentos por mídia armazenada.</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/torre/clientes">Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {topStorage.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum cliente cadastrado ainda.</p>
            ) : (
              topStorage.map((org) => {
                const limit = org.maxStorageMb * 1024 * 1024;
                const pct = limit > 0 ? Math.min(100, (org.storageBytes / limit) * 100) : 0;
                return (
                  <Link
                    key={org.id}
                    to="/torre/clientes/$organizationId"
                    params={{ organizationId: org.id }}
                    className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{org.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatBytes(org.storageBytes)} / {org.maxStorageMb} MB
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500 transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Infraestrutura</CardTitle>
            <CardDescription>Banco de dados e armazenamento de objetos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfraRow
              icon={Database}
              label="Banco de dados"
              ok={Boolean(infra?.databaseReady && infra?.schemaReady)}
              detail={infra?.schemaReady ? "Schema aplicado" : "Migrações pendentes"}
            />
            <InfraRow
              icon={HardDrive}
              label="Armazenamento (MinIO)"
              ok={Boolean(infra?.storageReady)}
              detail={infra?.storageError ?? "Bucket acessível"}
            />
            <InfraRow
              icon={Users}
              label="Usuários da plataforma"
              ok
              detail={`${data.users} contas de acesso`}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfraRow({
  icon: Icon,
  label,
  ok,
  detail,
}: {
  icon: typeof Database;
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
      <span className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </span>
      <span
        className={`flex items-center gap-1.5 text-xs ${ok ? "text-emerald-500" : "text-amber-500"}`}
      >
        {ok ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
        {detail}
      </span>
    </div>
  );
}
