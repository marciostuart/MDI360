import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, HardDrive, Loader2, LogIn, Save, Trash2, Tv, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  deleteOrganization,
  fetchOrganizationDetail,
  fetchPlans,
  impersonateOrganization,
  renameOrganization,
  updateOrganizationSubscription,
} from "@/lib/admin/platform.functions";
import { STATUS_LABEL, formatBytes, formatDate } from "@/lib/admin/format";

export const Route = createFileRoute("/torre/clientes/$organizationId")({
  head: () => ({
    meta: [
      { title: "Detalhes do cliente | Torre MDI 360" },
      { name: "description", content: "Limites, telas, usuários e consumo de um estabelecimento." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Detalhes do cliente | Torre MDI 360" },
      { property: "og:description", content: "Área interna de gestão de assinantes MDI 360." },
    ],
  }),
  component: ClientDetail,
});

const STATUSES = ["trial", "active", "past_due", "suspended", "canceled"] as const;
const NO_PLAN = "__none__";

function ClientDetail() {
  const { organizationId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["platform-org", organizationId],
    queryFn: () => fetchOrganizationDetail({ data: { organizationId } }),
    refetchInterval: 20_000,
  });
  const { data: plans } = useQuery({ queryKey: ["platform-plans"], queryFn: () => fetchPlans() });

  const [form, setForm] = useState({
    name: "",
    planId: NO_PLAN,
    subscriptionStatus: "trial",
    subscriptionExpiresAt: "",
    deviceLimitOverride: "",
    storageLimitMbOverride: "",
    notes: "",
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      name: data.organization.name,
      planId: data.organization.planId ?? NO_PLAN,
      subscriptionStatus: data.organization.subscriptionStatus,
      subscriptionExpiresAt: data.organization.subscriptionExpiresAt
        ? data.organization.subscriptionExpiresAt.slice(0, 10)
        : "",
      deviceLimitOverride: "",
      storageLimitMbOverride: "",
      notes: data.notes ?? "",
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      await renameOrganization({ data: { organizationId, name: form.name } });
      await updateOrganizationSubscription({
        data: {
          organizationId,
          planId: form.planId === NO_PLAN ? null : form.planId,
          subscriptionStatus: form.subscriptionStatus as (typeof STATUSES)[number],
          subscriptionExpiresAt: form.subscriptionExpiresAt || null,
          deviceLimitOverride: form.deviceLimitOverride ? Number(form.deviceLimitOverride) : null,
          storageLimitMbOverride: form.storageLimitMbOverride
            ? Number(form.storageLimitMbOverride)
            : null,
          notes: form.notes || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Cadastro atualizado.");
      void queryClient.invalidateQueries({ queryKey: ["platform-org", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["platform-organizations"] });
    },
    onError: () => toast.error("Não foi possível salvar as alterações."),
  });

  const remove = useMutation({
    mutationFn: () => deleteOrganization({ data: { organizationId } }),
    onSuccess: () => {
      toast.success("Estabelecimento removido.");
      void navigate({ to: "/torre/clientes" });
    },
    onError: () => toast.error("Não foi possível remover a conta."),
  });

  const impersonate = useMutation({
    mutationFn: () => impersonateOrganization({ data: { organizationId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message ?? "Não foi possível entrar nesta conta.");
        return;
      }
      void navigate({ to: "/studio" });
    },
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
          <CardTitle>Cliente não encontrado</CardTitle>
          <CardDescription>
            A conta pode ter sido removida ou você não tem acesso a esta área.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const org = data.organization;
  const storageLimit = org.maxStorageMb * 1024 * 1024;
  const storagePct = storageLimit ? Math.min(100, (org.storageBytes / storageLimit) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild size="icon" variant="ghost">
            <Link to="/torre/clientes">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-display text-2xl font-semibold">{org.name}</h1>
            <p className="text-sm text-muted-foreground">
              /{org.slug} · criado em {formatDate(org.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => impersonate.mutate()} disabled={impersonate.isPending}>
            <LogIn className="mr-2 size-4" /> Entrar como cliente
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="mr-2 size-4" /> Excluir
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir {org.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Todos os usuários, telas, mídias e playlists desta conta serão apagados
                  definitivamente. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove.mutate()}>
                  Excluir definitivamente
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={Tv}
          label="Telas vinculadas"
          value={`${org.linkedDevices}/${org.maxDevices}`}
          hint={`${org.onlineDevices} online · ${org.pendingDevices} aguardando`}
        />
        <SummaryCard
          icon={HardDrive}
          label="Disco ocupado"
          value={formatBytes(org.storageBytes)}
          hint={`${storagePct.toFixed(0)}% do limite de ${org.maxStorageMb} MB`}
        />
        <SummaryCard
          icon={Users}
          label="Usuários"
          value={String(org.users)}
          hint={`${org.mediaCount} mídias enviadas`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Assinatura e limites</CardTitle>
            <CardDescription>
              Os limites do plano valem para todos. Preencha um limite personalizado só se este
              cliente tiver um acordo diferente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do estabelecimento</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select
                  value={form.planId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, planId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sem plano" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PLAN}>Sem plano</SelectItem>
                    {(plans ?? []).map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} · {plan.maxDevices} telas
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Situação</Label>
                <Select
                  value={form.subscriptionStatus}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, subscriptionStatus: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {STATUS_LABEL[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Vencimento</Label>
              <Input
                type="date"
                value={form.subscriptionExpiresAt}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, subscriptionExpiresAt: event.target.value }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Limite de telas (personalizado)</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder={`Plano: ${org.maxDevices}`}
                  value={form.deviceLimitOverride}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, deviceLimitOverride: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Limite de disco em MB (personalizado)</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder={`Plano: ${org.maxStorageMb}`}
                  value={form.storageLimitMbOverride}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, storageLimitMbOverride: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Anotações internas</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Combinações comerciais, contatos, histórico de suporte…"
              />
            </div>

            <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
              {save.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              Salvar alterações
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Telas</CardTitle>
              <CardDescription>{data.devices.length} dispositivos cadastrados.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.devices.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma tela cadastrada.</p>
              ) : (
                data.devices.map((device) => (
                  <div
                    key={device.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{device.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Visto em {formatDate(device.lastSeenAt)}
                        {device.appVersion ? ` · v${device.appVersion}` : ""}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        device.online
                          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600"
                          : device.status === "active"
                            ? "border-amber-500/30 bg-amber-500/15 text-amber-600"
                            : ""
                      }
                    >
                      {device.online ? "Online" : device.status === "active" ? "Offline" : "Pendente"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Maiores arquivos</CardTitle>
              <CardDescription>Onde o disco deste cliente está sendo consumido.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.topMedia.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma mídia enviada.</p>
              ) : (
                data.topMedia.map((media) => (
                  <div
                    key={media.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="truncate pr-3">{media.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatBytes(media.byteSize)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usuários</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(user.lastLoginAt)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Tv;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
