import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, Save, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  fetchSmtpAdmin,
  saveSmtpAdmin,
  sendSmtpTestAdmin,
  verifySmtpAdmin,
  type SmtpAdminInput,
} from "@/lib/admin/smtp.functions";

export const Route = createFileRoute("/torre/email")({
  head: () => ({ meta: [{ title: "E-mail SMTP | Torre MDI 360" }] }),
  component: SmtpPage,
});

function SmtpPage() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["admin-smtp"],
    queryFn: () => fetchSmtpAdmin(),
  });
  const [draft, setDraft] = useState<SmtpAdminInput | null>(null);
  const [recipient, setRecipient] = useState("");
  useEffect(() => {
    if (!data) return;
    setDraft({ ...data, password: "", clearPassword: false });
  }, [data]);
  const save = useMutation({
    mutationFn: (input: SmtpAdminInput) => saveSmtpAdmin({ data: input }),
    onSuccess: () => {
      toast.success("Configuração SMTP salva com segurança.");
      void queryClient.invalidateQueries({ queryKey: ["admin-smtp"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar."),
  });
  const verify = useMutation({
    mutationFn: () => verifySmtpAdmin(),
    onSuccess: () => toast.success("Conexão, TLS e autenticação SMTP validados."),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Falha na conexão SMTP."),
  });
  const send = useMutation({
    mutationFn: () => sendSmtpTestAdmin({ data: { recipient } }),
    onSuccess: () => toast.success("E-mail de teste aceito pelo servidor SMTP."),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha no envio."),
  });
  if (isPending || !data || !draft)
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  const set = <K extends keyof SmtpAdminInput>(key: K, value: SmtpAdminInput[K]) =>
    setDraft((old) => (old ? { ...old, [key]: value } : old));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">E-mail transacional</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure uma conta SMTP para notificações e mensagens do MDI 360.
          </p>
        </div>
        <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Save className="mr-2 size-4" />
          )}
          Salvar SMTP
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5" />
            Servidor SMTP
          </CardTitle>
          <CardDescription>
            A senha é criptografada e nunca volta a ser exibida. Certificados TLS inválidos são
            recusados.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <Toggle
            label="Habilitar envios"
            description="Desative para interromper todos os e-mails transacionais."
            checked={draft.enabled}
            onChange={(value) => set("enabled", value)}
          />
          <div />
          <Field label="Servidor SMTP">
            <Input
              value={draft.host}
              placeholder="smtp.seudominio.com.br"
              onChange={(e) => set("host", e.target.value)}
            />
          </Field>
          <Field label="Porta">
            <Input
              type="number"
              min={1}
              max={65535}
              value={draft.port}
              onChange={(e) => set("port", Number(e.target.value))}
            />
          </Field>
          <Toggle
            label="TLS direto (SSL)"
            description="Ative normalmente na porta 465."
            checked={draft.secure}
            onChange={(value) => set("secure", value)}
          />
          <Toggle
            label="Exigir STARTTLS"
            description="Recomendado nas portas 587 ou 25."
            checked={draft.requireTls}
            onChange={(value) => set("requireTls", value)}
          />
          <Field label="Usuário">
            <Input
              autoComplete="username"
              value={draft.username}
              onChange={(e) => set("username", e.target.value)}
            />
          </Field>
          <Field label={`Senha${data.passwordConfigured ? " (já configurada)" : ""}`}>
            <Input
              type="password"
              autoComplete="new-password"
              value={draft.password}
              placeholder={data.passwordConfigured ? "Deixe vazio para manter" : "Senha SMTP"}
              onChange={(e) => set("password", e.target.value)}
            />
          </Field>
          <Field label="Nome do remetente">
            <Input value={draft.fromName} onChange={(e) => set("fromName", e.target.value)} />
          </Field>
          <Field label="E-mail do remetente">
            <Input
              type="email"
              value={draft.fromEmail}
              onChange={(e) => set("fromEmail", e.target.value)}
            />
          </Field>
          <Field label="Responder para (opcional)">
            <Input
              type="email"
              value={draft.replyTo}
              onChange={(e) => set("replyTo", e.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => verify.mutate()} disabled={verify.isPending}>
              <ShieldCheck className="mr-2 size-4" />
              Validar conexão salva
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Enviar mensagem de teste</CardTitle>
          <CardDescription>
            Primeiro salve e valide a configuração. Depois informe um endereço ao qual você tenha
            acesso.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input
            type="email"
            placeholder="voce@dominio.com.br"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
          <Button disabled={!recipient || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Send className="mr-2 size-4" />
            )}
            Enviar teste
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
      <div>
        <Label>{label}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
