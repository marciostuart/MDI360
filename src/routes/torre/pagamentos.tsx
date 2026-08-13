import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, CreditCard, Loader2, Save, TestTube2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  fetchMercadoPagoAdmin,
  saveMercadoPagoAdmin,
  testMercadoPagoAdmin,
  type MercadoPagoAdminInput,
} from "@/lib/admin/mercado-pago.functions";

export const Route = createFileRoute("/torre/pagamentos")({
  head: () => ({ meta: [{ title: "Pagamentos | Torre MDI 360" }] }),
  component: MercadoPagoPage,
});

const EMPTY_PROFILE = {
  publicKey: "",
  accessToken: "",
  clearAccessToken: false,
  applicationId: "",
  accountId: "",
  webhookSecret: "",
  clearWebhookSecret: false,
};

function MercadoPagoPage() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["admin-mercado-pago"],
    queryFn: () => fetchMercadoPagoAdmin(),
  });
  const [draft, setDraft] = useState<MercadoPagoAdminInput | null>(null);

  useEffect(() => {
    if (!data) return;
    setDraft({
      activeEnvironment: data.activeEnvironment,
      test: { ...EMPTY_PROFILE, ...data.profiles.test },
      production: { ...EMPTY_PROFILE, ...data.profiles.production },
    });
  }, [data]);

  const save = useMutation({
    mutationFn: (input: MercadoPagoAdminInput) => saveMercadoPagoAdmin({ data: input }),
    onSuccess: () => {
      toast.success("Credenciais do Mercado Pago salvas com segurança.");
      void queryClient.invalidateQueries({ queryKey: ["admin-mercado-pago"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar."),
  });
  const test = useMutation({
    mutationFn: (environment: "test" | "production") =>
      testMercadoPagoAdmin({ data: { environment } }),
    onSuccess: () => toast.success("Conexão validada com a conta do Mercado Pago."),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha na conexão."),
  });

  if (isPending || !data || !draft) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const update = (
    environment: "test" | "production",
    key: keyof MercadoPagoAdminInput["test"],
    value: string | boolean,
  ) =>
    setDraft((current) =>
      current ? { ...current, [environment]: { ...current[environment], [key]: value } } : current,
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Pagamentos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie o Checkout Transparente do Mercado Pago sem alterar o Portainer.
          </p>
        </div>
        <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Save className="mr-2 size-4" />
          )}
          Salvar configurações
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5" />
            Ambiente ativo
          </CardTitle>
          <CardDescription>
            Use Teste durante a homologação. Produção só deve ser ativado depois de todos os
            pagamentos simulados.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Label>Teste</Label>
          <Switch
            checked={draft.activeEnvironment === "production"}
            onCheckedChange={(checked) =>
              setDraft({ ...draft, activeEnvironment: checked ? "production" : "test" })
            }
          />
          <Label>Produção</Label>
          <Badge variant="outline">
            Ativo: {draft.activeEnvironment === "production" ? "Produção" : "Teste"}
          </Badge>
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle>Homologação Sandbox</CardTitle>
          <CardDescription>
            Simule Pix, cartão aprovado ou recusado, boleto e recebimento do webhook sem afetar
            clientes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/torre/pagamentos-testes">
              <TestTube2 className="mr-2 size-4" />
              Abrir laboratório de pagamentos
            </Link>
          </Button>
        </CardContent>
      </Card>

      {(["test", "production"] as const).map((environment) => {
        const profile = draft[environment];
        const saved = data.profiles[environment];
        return (
          <Card key={environment}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {environment === "test" ? "Credenciais de teste" : "Credenciais de produção"}
                {saved.ready && <CheckCircle2 className="size-5 text-primary" />}
              </CardTitle>
              <CardDescription>
                Os segredos são criptografados e nunca voltam a ser exibidos após salvar.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <Field label="Public Key">
                <Input
                  value={profile.publicKey}
                  onChange={(e) => update(environment, "publicKey", e.target.value)}
                />
              </Field>
              <Field label="Nº da aplicação">
                <Input
                  inputMode="numeric"
                  value={profile.applicationId}
                  onChange={(e) => update(environment, "applicationId", e.target.value)}
                />
              </Field>
              <Field label="User ID">
                <Input
                  inputMode="numeric"
                  value={profile.accountId}
                  onChange={(e) => update(environment, "accountId", e.target.value)}
                />
              </Field>
              <Field
                label={`Access Token${saved.accessTokenConfigured ? " (já configurado)" : ""}`}
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    saved.accessTokenConfigured ? "Deixe vazio para manter" : "Cole o Access Token"
                  }
                  value={profile.accessToken}
                  onChange={(e) => update(environment, "accessToken", e.target.value)}
                />
              </Field>
              <Field
                label={`Segredo do webhook${saved.webhookSecretConfigured ? " (já configurado)" : ""}`}
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    saved.webhookSecretConfigured
                      ? "Deixe vazio para manter"
                      : "Será informado na etapa do webhook"
                  }
                  value={profile.webhookSecret}
                  onChange={(e) => update(environment, "webhookSecret", e.target.value)}
                />
              </Field>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => test.mutate(environment)}
                  disabled={test.isPending}
                >
                  <TestTube2 className="mr-2 size-4" />
                  Testar credenciais salvas
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>URL do webhook</CardTitle>
          <CardDescription>
            Use esta mesma URL nas notificações de Teste e Produção no Mercado Pago.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input readOnly value={data.webhookUrl} />
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(data.webhookUrl);
              toast.success("URL copiada.");
            }}
          >
            <Copy className="size-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
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
