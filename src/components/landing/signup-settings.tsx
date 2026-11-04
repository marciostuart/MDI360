import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { fetchSignupAdmin, saveSignupWebhook } from "@/lib/landing/signup-admin.functions";

export function SignupSettings() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["signup-admin"], queryFn: () => fetchSignupAdmin() });
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (query.data) {
      setEnabled(query.data.webhook.enabled);
      setUrl(query.data.webhook.url);
    }
  }, [query.data]);
  const save = useMutation({
    mutationFn: () => saveSignupWebhook({ data: { enabled, url } }),
    onSuccess: () => {
      toast.success("Configuração do pré-cadastro salva.");
      void client.invalidateQueries({ queryKey: ["signup-admin"] });
    },
    onError: () => toast.error("Webhook inválido ou não autorizado. Use HTTPS público."),
  });
  if (query.isPending)
    return <p className="py-8 text-sm text-muted-foreground">Carregando pré-cadastros…</p>;
  if (query.isError || !query.data)
    return (
      <p role="alert" className="py-8 text-destructive">
        Sem acesso ou falha ao carregar os pré-cadastros.
      </p>
    );
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Integração do pré-cadastro</CardTitle>
          <CardDescription>
            O webhook recebe os dados após o lead confirmar o e-mail; payload JSON e envio com chave
            de idempotência.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center gap-3">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span>Enviar leads confirmados ao webhook</span>
          </div>
          <Input
            type="url"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button
            className="w-fit"
            disabled={save.isPending || (enabled && !url)}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Salvando…" : "Salvar webhook"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Cadastros confirmados</CardTitle>
          <CardDescription>
            Últimos 100 registros. Dados sensíveis só são visíveis para a equipe da plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.data.leads.length ? (
            query.data.leads.map((lead) => (
              <details key={lead.id} className="rounded-md border p-3">
                <summary className="cursor-pointer">
                  {lead.name} · {lead.email} · {new Date(lead.createdAt).toLocaleString("pt-BR")} ·
                  webhook: {lead.webhookStatus}
                </summary>
                <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs">{lead.payload}</pre>
              </details>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum cadastro confirmado ainda.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
