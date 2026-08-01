import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, Search, Settings2, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { deletePlan, fetchPlans, savePlan, type PlatformPlan } from "@/lib/admin/platform.functions";
import { formatMoney } from "@/lib/admin/format";

export const Route = createFileRoute("/torre/planos")({
  head: () => ({
    meta: [
      { title: "Planos | Torre MDI 360" },
      { name: "description", content: "Configuração dos planos comerciais e limites do MDI 360." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Planos | Torre MDI 360" },
      { property: "og:description", content: "Configuração comercial da plataforma MDI 360." },
    ],
  }),
  component: PlansPage,
});

type Draft = {
  id?: string;
  name: string;
  slug: string;
  maxDevices: string;
  maxStorageMb: string;
  price: string;
  queueEnabled: boolean;
  isActive: boolean;
};

const EMPTY: Draft = {
  name: "",
  slug: "",
  maxDevices: "5",
  maxStorageMb: "2048",
  price: "0",
  queueEnabled: true,
  isActive: true,
};

export default function PlansPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [sortBy, setSortBy] = useState<"price-asc" | "price-desc" | "name" | "newest">("price-asc");

  const { data, isPending } = useQuery({ queryKey: ["platform-plans"], queryFn: () => fetchPlans() });

  const persist = useMutation({
    mutationFn: (value: Draft) =>
      savePlan({
        data: {
          id: value.id,
          name: value.name,
          slug: value.slug,
          maxDevices: Number(value.maxDevices),
          maxStorageMb: Number(value.maxStorageMb),
          priceCents: Math.round(Number(value.price.replace(",", ".")) * 100),
          queueEnabled: value.queueEnabled,
          isActive: value.isActive,
        },
      }),
    onSuccess: () => {
      toast.success("Plano salvo.");
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["platform-plans"] });
    },
    onError: () => toast.error("Confira os campos: nome, identificador e limites."),
  });

  const remove = useMutation({
    mutationFn: (planId: string) => deletePlan({ data: { planId } }),
    onSuccess: () => {
      toast.success("Plano excluído.");
      void queryClient.invalidateQueries({ queryKey: ["platform-plans"] });
    },
    onError: () => toast.error("Não foi possível excluir o plano."),
  });

  const startEdit = (plan: PlatformPlan) =>
    setDraft({
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      maxDevices: String(plan.maxDevices),
      maxStorageMb: String(plan.maxStorageMb),
      price: (plan.priceCents / 100).toFixed(2),
      queueEnabled: plan.queueEnabled,
      isActive: plan.isActive,
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

  const term = search.trim().toLowerCase();
  const filtered = data
    .filter((plan) => {
      const matchesTerm =
        !term ||
        plan.name.toLowerCase().includes(term) ||
        plan.slug.toLowerCase().includes(term);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? plan.isActive : !plan.isActive);
      return matchesTerm && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "pt-BR");
      if (sortBy === "newest") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === "price-desc") return b.priceCents - a.priceCents;
      return a.priceCents - b.priceCents;
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Planos</h1>
          <p className="text-sm text-muted-foreground">
            Cada plano define quantas telas e quanto disco o cliente pode usar.
          </p>
        </div>
        <Button onClick={() => setDraft({ ...EMPTY })}>
          <Plus className="mr-2 size-4" /> Novo plano
        </Button>
      </div>

      {draft ? (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>{draft.id ? "Editar plano" : "Novo plano"}</CardTitle>
            <CardDescription>
              O identificador é usado internamente — use apenas letras minúsculas e hífen.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={draft.name}
                placeholder="Profissional"
                onChange={(event) =>
                  setDraft((prev) => prev && { ...prev, name: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Identificador</Label>
              <Input
                value={draft.slug}
                placeholder="profissional"
                onChange={(event) =>
                  setDraft((prev) => prev && { ...prev, slug: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Preço mensal (R$)</Label>
              <Input
                value={draft.price}
                onChange={(event) =>
                  setDraft((prev) => prev && { ...prev, price: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Limite de telas</Label>
              <Input
                type="number"
                min={1}
                value={draft.maxDevices}
                onChange={(event) =>
                  setDraft((prev) => prev && { ...prev, maxDevices: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Armazenamento (MB)</Label>
              <Input
                type="number"
                min={64}
                value={draft.maxStorageMb}
                onChange={(event) =>
                  setDraft((prev) => prev && { ...prev, maxStorageMb: event.target.value })
                }
              />
            </div>
            <div className="flex items-end justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div>
                <Label>Sistema de senhas</Label>
                <p className="text-xs text-muted-foreground">
                  Desligado, o cliente vê o aviso de recurso pago.
                </p>
              </div>
              <Switch
                checked={draft.queueEnabled}
                onCheckedChange={(checked) =>
                  setDraft((prev) => prev && { ...prev, queueEnabled: checked })
                }
              />
            </div>
            <div className="flex items-end justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div>
                <Label>Disponível para venda</Label>
                <p className="text-xs text-muted-foreground">Some da vitrine quando desligado.</p>
              </div>
              <Switch
                checked={draft.isActive}
                onCheckedChange={(checked) =>
                  setDraft((prev) => prev && { ...prev, isActive: checked })
                }
              />
            </div>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <Button onClick={() => persist.mutate(draft)} disabled={persist.isPending}>
                {persist.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Check className="mr-2 size-4" />
                )}
                Salvar plano
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar planos"
            className="pl-9"
            aria-label="Pesquisar planos"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
          <SelectTrigger className="w-[160px]" aria-label="Filtrar por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Ocultos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
          <SelectTrigger className="w-[210px]" aria-label="Ordenar">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="price-asc">Preço: menor → maior</SelectItem>
            <SelectItem value="price-desc">Preço: maior → menor</SelectItem>
            <SelectItem value="name">Nome (A-Z)</SelectItem>
            <SelectItem value="newest">Cadastro mais recente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum plano cadastrado. Crie o primeiro pelo botão acima.
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum plano encontrado com essa busca.</p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {filtered.map((plan) => (
            <div key={plan.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-[220px] flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Tags className="size-4 shrink-0 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => startEdit(plan)}
                    className="truncate text-left text-sm font-medium underline-offset-4 hover:text-primary hover:underline"
                  >
                    {plan.name}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={plan.isActive ? "default" : "outline"}>
                    {plan.isActive ? "Ativo" : "Oculto"}
                  </Badge>
                  <Badge variant="secondary">{formatMoney(plan.priceCents)}/mês</Badge>
                  <Badge variant="outline">{plan.maxDevices} telas</Badge>
                  <Badge variant="outline">{(plan.maxStorageMb / 1024).toFixed(1)} GB</Badge>
                  <Badge variant="outline">
                    {plan.organizations} cliente{plan.organizations === 1 ? "" : "s"}
                  </Badge>
                  {plan.queueEnabled ? (
                    <Badge variant="outline">Senhas</Badge>
                  ) : (
                    <Badge variant="destructive">Sem senhas</Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => startEdit(plan)}
                >
                  <Settings2 className="size-4" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  onClick={() => remove.mutate(plan.id)}
                  disabled={remove.isPending}
                  aria-label={`Remover ${plan.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
