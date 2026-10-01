import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, MonitorPlay } from "lucide-react";
import { toast } from "sonner";

import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/lib/auth/account-security.functions";
import { useSetupState } from "@/lib/auth/useCurrentUser";

export const Route = createFileRoute("/recuperar-senha")({
  head: () => ({ meta: [{ title: "Recuperar senha | MDI 360" }] }),
  component: RecoverPasswordPage,
});

function RecoverPasswordPage() {
  const setup = useSetupState();
  const requestFn = useServerFn(requestPasswordReset);
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [sent, setSent] = useState(false);
  const request = useMutation({
    mutationFn: () => requestFn({ data: { email, turnstileToken } }),
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.message);
      setSent(true);
      toast.success(result.message);
    },
    onError: () => toast.error("Não foi possível processar a solicitação."),
    onSettled: () => {
      setTurnstileToken("");
      setChallenge((value) => value + 1);
    },
  });

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="console-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative w-full max-w-md space-y-5">
        <Link to="/" className="flex items-center justify-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><MonitorPlay className="size-5" /></span>
          <span className="font-display text-lg font-semibold">MDI 360</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Recuperar senha</CardTitle>
            <CardDescription>Enviaremos um link de uso único, válido por 30 minutos.</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4 text-sm">
                <p>Se o endereço estiver cadastrado, as instruções chegarão por e-mail.</p>
                <Button asChild variant="outline" className="w-full"><Link to="/entrar"><ArrowLeft className="mr-2 size-4" />Voltar ao login</Link></Button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); request.mutate(); }}>
                <div className="space-y-2">
                  <Label htmlFor="recovery-email">E-mail de acesso</Label>
                  <Input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>
                {setup.data?.turnstileSiteKey ? <TurnstileWidget key={challenge} siteKey={setup.data.turnstileSiteKey} action="password_reset" onToken={setTurnstileToken} /> : null}
                <Button type="submit" className="w-full" disabled={request.isPending || Boolean(setup.data?.turnstileSiteKey && !turnstileToken)}>
                  {request.isPending ? <Loader2 className="size-4 animate-spin" /> : "Enviar instruções"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
