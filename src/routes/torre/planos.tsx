import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  isActive: boolean;
};

const EMPTY: Draft = {
  name: "",
  slug: "",
  maxDevices: "5",
  maxStorageMb: "2048",
  price: "0",
  isActive: true,
};

function PlansPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
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

  const startEdit = (plan: PlatformPlan) =>
    setDraft({
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      maxDevices: String(plan.maxDevices),
      maxStorageMb: String(plan.maxStorageMb),
      price: (plan.priceCents / 100).toFixed(2),
      isActive: plan.isActive,
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map((plan) => (
          <Card key={plan.id} className="transition-shadow hover:shadow-lg">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Tags className="size-4 text-primary" />
                    {plan.name}
                  </CardTitle>
                  <CardDescription>{plan.slug}</CardDescription>
                </div>
                <Badge variant={plan.isActive ? "default" : "outline"}>
                  {plan.isActive ? "Ativo" : "Oculto"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="font-display text-2xl font-semibold">{formatMoney(plan.priceCents)}</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>Até {plan.maxDevices} telas</li>
                <li>{(plan.maxStorageMb / 1024).toFixed(1)} GB de armazenamento</li>
                <li>{plan.organizations} clientes neste plano</li>
              </ul>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => startEdit(plan)}>
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove.mutate(plan.id)}
                  disabled={remove.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
