import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Loader2,
  LogIn,
  Search,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchPlatformOrganizations,
  impersonateOrganization,
} from "@/lib/admin/platform.functions";
import { STATUS_LABEL, formatBytes, formatDate } from "@/lib/admin/format";

export const Route = createFileRoute("/torre/clientes/")({
  head: () => ({
    meta: [
      { title: "Estabelecimentos | Torre MDI 360" },
      { name: "description", content: "Gestão dos estabelecimentos assinantes do MDI 360." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Estabelecimentos | Torre MDI 360" },
      { property: "og:description", content: "Gestão dos assinantes da plataforma MDI 360." },
    ],
  }),
  component: ClientsPage,
});

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  trial: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  past_due: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  suspended: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  canceled: "bg-muted text-muted-foreground border-border",
};

type SortBy = "newest" | "oldest" | "name";
type StatusFilter = "all" | "active" | "trial" | "past_due" | "suspended" | "canceled";

function ClientsPage() {
  const [term, setTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const navigate = useNavigate();
  const { data, isPending } = useQuery({
    queryKey: ["platform-organizations"],
    queryFn: () => fetchPlatformOrganizations(),
    refetchInterval: 20_000,
  });

  const impersonate = useMutation({
    mutationFn: (organizationId: string) => impersonateOrganization({ data: { organizationId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message ?? "Não foi possível entrar nesta conta.");
        return;
      }
      toast.success("Entrando no painel do cliente…");
      void navigate({ to: "/studio" });
    },
    onError: () => toast.error("Não foi possível entrar nesta conta."),
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
          <CardTitle>Área restrita</CardTitle>
          <CardDescription>Entre com uma conta da plataforma para continuar.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const searchTerm = term.trim().toLowerCase();
  const filtered = data
    .filter((org) => {
      const matchesTerm =
        !searchTerm ||
        org.name.toLowerCase().includes(searchTerm) ||
        org.slug.toLowerCase().includes(searchTerm) ||
        (org.ownerEmail ?? "").toLowerCase().includes(searchTerm);
      const matchesStatus = statusFilter === "all" || org.subscriptionStatus === statusFilter;
      return matchesTerm && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "pt-BR");
      const diff = new Date(a.updatedAt ?? a.createdAt).getTime() - new Date(b.updatedAt ?? b.createdAt).getTime();
      return sortBy === "oldest" ? diff : -diff;
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Estabelecimentos</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {data.length} contas cadastradas na plataforma. Clique no nome de um estabelecimento
            para ver detalhes, ou use "Entrar" para acessar o painel do cliente.
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link to="/torre/clientes/novo">
            <Settings2 className="size-4" />
            Novo estabelecimento
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Buscar por nome, slug ou e-mail"
            className="pl-9"
            aria-label="Buscar estabelecimentos"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
          <SelectTrigger className="w-[180px]" aria-label="Filtrar por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="trial">Teste</SelectItem>
            <SelectItem value="past_due">Em atraso</SelectItem>
            <SelectItem value="suspended">Suspenso</SelectItem>
            <SelectItem value="canceled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
          <SelectTrigger className="w-[210px]" aria-label="Ordenar">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Alteração mais recente</SelectItem>
            <SelectItem value="oldest">Alteração mais antiga</SelectItem>
            <SelectItem value="name">Nome (A-Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum estabelecimento encontrado com esses filtros.
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {filtered.map((org) => {
            const storageLimit = org.maxStorageMb * 1024 * 1024;
            const storagePct = storageLimit ? Math.min(100, (org.storageBytes / storageLimit) * 100) : 0;
            const devicePct = org.maxDevices
              ? Math.min(100, (org.linkedDevices / org.maxDevices) * 100)
              : 0;
            return (
              <div key={org.id} className="flex flex-wrap items-start gap-4 p-4">
                <div className="min-w-[220px] flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="size-4 shrink-0 text-muted-foreground" />
                    <Link
                      to="/torre/clientes/$organizationId"
                      params={{ organizationId: org.id }}
                      className="truncate text-left text-sm font-medium underline-offset-4 transition-colors hover:text-primary hover:underline"
                      title={`Abrir detalhes de ${org.name}`}
                    >
                      {org.name}
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className={STATUS_TONE[org.subscriptionStatus] ?? ""}>
                      {STATUS_LABEL[org.subscriptionStatus] ?? org.subscriptionStatus}
                    </Badge>
                    <Badge variant="secondary">{org.planName ?? "Sem plano"}</Badge>
                    <Badge variant="outline">Vence {formatDate(org.subscriptionExpiresAt)}</Badge>
                    <Badge variant="outline">
                      {org.linkedDevices}/{org.maxDevices} telas
                    </Badge>
                    <Badge variant="outline">
                      {formatBytes(org.storageBytes)} / {org.maxStorageMb} MB
                    </Badge>
                    {org.onlineDevices > 0 ? (
                      <Badge variant="outline" className="text-emerald-600">
                        {org.onlineDevices} online
                      </Badge>
                    ) : null}
                  </div>
                  <MeterBars devicePct={devicePct} storagePct={storagePct} />
                </div>

                <div className="flex items-center gap-2">
                  <Button asChild size="sm" variant="outline" className="gap-2">
                    <Link
                      to="/torre/clientes/$organizationId"
                      params={{ organizationId: org.id }}
                    >
                      <Settings2 className="size-4" />
                      Detalhes
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2"
                    disabled={impersonate.isPending}
                    onClick={() => impersonate.mutate(org.id)}
                  >
                    <LogIn className="size-4" />
                    Entrar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MeterBars({ devicePct, storagePct }: { devicePct: number; storagePct: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Meter label="Telas vinculadas" pct={devicePct} />
      <Meter label="Armazenamento" pct={storagePct} />
    </div>
  );
}

function Meter({ label, pct }: { label: string; pct: number }) {
  const tone =
    pct >= 100
      ? "from-rose-500 to-rose-600"
      : pct >= 80
        ? "from-amber-500 to-orange-500"
        : "from-sky-500 to-violet-500";
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{pct.toFixed(0)}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${tone} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
