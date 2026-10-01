import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/lib/auth/account-security.functions";

export const Route = createFileRoute("/redefinir-senha/$token")({ component: ResetPasswordPage });

function ResetPasswordPage() {
  const { token } = Route.useParams();
  const resetFn = useServerFn(resetPassword);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [done, setDone] = useState(false);
  const reset = useMutation({
    mutationFn: () => {
      if (password !== confirmation) throw new Error("As senhas não coincidem.");
      return resetFn({ data: { token, password } });
    },
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.message);
      setDone(true);
      toast.success("Senha alterada. As sessões anteriores foram encerradas.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível alterar a senha."),
  });
  return <AuthActionCard title="Definir nova senha" description="Use pelo menos 8 caracteres.">
    {done ? <Button asChild className="w-full"><Link to="/entrar">Entrar com a nova senha</Link></Button> : <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); reset.mutate(); }}>
      <div className="space-y-2"><Label>Nova senha</Label><Input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
      <div className="space-y-2"><Label>Confirmar nova senha</Label><Input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
      <Button className="w-full" disabled={reset.isPending}>{reset.isPending ? <Loader2 className="size-4 animate-spin" /> : "Alterar senha"}</Button>
    </form>}
  </AuthActionCard>;
}

function AuthActionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center px-4"><Card className="w-full max-w-md"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card></main>;
}
