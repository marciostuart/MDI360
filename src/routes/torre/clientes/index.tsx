import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, LogIn, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

function ClientsPage() {
  const [term, setTerm] = useState("");
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

  const filtered = data.filter((org) =>
    `${org.name} ${org.slug} ${org.ownerEmail ?? ""}`.toLowerCase().includes(term.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Estabelecimentos</h1>
          <p className="text-sm text-muted-foreground">
            {data.length} contas cadastradas na plataforma.
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((org) => {
          const storageLimit = org.maxStorageMb * 1024 * 1024;
          const storagePct = storageLimit ? Math.min(100, (org.storageBytes / storageLimit) * 100) : 0;
          const devicePct = org.maxDevices
            ? Math.min(100, (org.linkedDevices / org.maxDevices) * 100)
            : 0;
          return (
            <Card key={org.id} className="flex flex-col transition-shadow hover:shadow-lg">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{org.name}</CardTitle>
                    <CardDescription>{org.ownerEmail ?? "sem usuário"}</CardDescription>
                  </div>
                  <Badge variant="outline" className={STATUS_TONE[org.subscriptionStatus] ?? ""}>
                    {STATUS_LABEL[org.subscriptionStatus] ?? org.subscriptionStatus}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4 text-sm">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{org.planName ?? "Sem plano"}</span>
                  <span>Vence {formatDate(org.subscriptionExpiresAt)}</span>
                </div>

                <div className="space-y-2">
                  <Meter
                    label="Telas vinculadas"
                    value={`${org.linkedDevices}/${org.maxDevices}`}
                    pct={devicePct}
                    hint={`${org.onlineDevices} online`}
                  />
                  <Meter
                    label="Armazenamento"
                    value={`${formatBytes(org.storageBytes)} / ${org.maxStorageMb} MB`}
                    pct={storagePct}
                    hint={`${org.mediaCount} arquivos`}
                  />
                </div>

                <div className="mt-auto flex gap-2 pt-2">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link
                      to="/torre/clientes/$organizationId"
                      params={{ organizationId: org.id }}
                    >
                      Detalhes <ArrowRight className="ml-1 size-3.5" />
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={impersonate.isPending}
                    onClick={() => impersonate.mutate(org.id)}
                  >
                    <LogIn className="mr-1 size-3.5" /> Entrar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum estabelecimento encontrado.
        </p>
      ) : null}
    </div>
  );
}

function Meter({
  label,
  value,
  pct,
  hint,
}: {
  label: string;
  value: string;
  pct: number;
  hint: string;
}) {
  const tone =
    pct >= 100 ? "from-rose-500 to-rose-600" : pct >= 80 ? "from-amber-500 to-orange-500" : "from-sky-500 to-violet-500";
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${tone} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
