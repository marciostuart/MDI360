import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchPay360BhAdmin,
  savePay360BhAdmin,
  type Pay360BhAdminInput,
} from "@/lib/admin/pay360bh.functions";

export function Pay360BhAdminCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-pay360bh"],
    queryFn: () => fetchPay360BhAdmin(),
  });
  const [draft, setDraft] = useState<Pay360BhAdminInput>({
    projectCode: "",
    serviceKey: "",
    notificationToken: "",
    clearServiceKey: false,
    clearNotificationToken: false,
  });
  useEffect(() => {
    if (!data) return;
    setDraft({
      projectCode: data.projectCode,
      serviceKey: "",
      notificationToken: "",
      clearServiceKey: false,
      clearNotificationToken: false,
    });
  }, [data]);
  const save = useMutation({
    mutationFn: (input: Pay360BhAdminInput) => savePay360BhAdmin({ data: input }),
    onSuccess: () => {
      toast.success("Configuração da Central Pay 360BH salva.");
      void queryClient.invalidateQueries({ queryKey: ["admin-pay360bh"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a Central."),
  });

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Central de Cobranças Pay 360BH
          {data?.ready ? <CheckCircle2 className="size-5 text-primary" /> : null}
        </CardTitle>
        <CardDescription>
          As novas cobranças usam a API v1. O manual atual suporta Pix; cartão, boleto, consulta por
          referência e cancelamento ainda não são oferecidos pela Central.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando configuração da Central...
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Código do serviço cadastrado na Central">
                <Input
                  value={draft.projectCode}
                  autoComplete="off"
                  onChange={(event) => setDraft({ ...draft, projectCode: event.target.value })}
                />
              </Field>
              <Field label="URL da API">
                <Input readOnly value={data.apiUrl} />
              </Field>
              <Field
                label={`Chave do serviço${data.serviceKeyConfigured ? " (configurada; vazio mantém)" : ""}`}
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={draft.serviceKey}
                  onChange={(event) => setDraft({ ...draft, serviceKey: event.target.value })}
                  placeholder={
                    data.serviceKeyConfigured ? "Deixe vazio para manter" : "Cole a chave"
                  }
                />
              </Field>
              <Field
                label={`Token de notificação${data.notificationTokenConfigured ? " (configurado; vazio mantém)" : ""}`}
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={draft.notificationToken}
                  onChange={(event) =>
                    setDraft({ ...draft, notificationToken: event.target.value })
                  }
                  placeholder={
                    data.notificationTokenConfigured ? "Deixe vazio para manter" : "Cole o token"
                  }
                />
              </Field>
            </div>
            <div className="space-y-2 rounded-lg border p-4">
              <Label>URL do webhook para cadastrar no serviço Pay 360BH</Label>
              <div className="flex gap-2">
                <Input readOnly value={data.webhookUrl} />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(data.webhookUrl);
                    toast.success("URL do webhook copiada.");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Cadastre esta URL no serviço e informe o código do projeto e o token de notificação
                exatamente como aparecem na Central. Os segredos são criptografados e não retornam
                ao navegador.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => save.mutate(draft)}
                disabled={save.isPending || !draft.projectCode.trim()}
              >
                {save.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Save className="mr-2 size-4" />
                )}
                Salvar configuração Pay 360BH
              </Button>
              <Badge variant={data.ready ? "default" : "outline"}>
                {data.ready ? "Pronta para cobranças Pix" : "Aguardando configuração"}
              </Badge>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
