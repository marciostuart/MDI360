import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { confirmEmailChange } from "@/lib/auth/account-security.functions";

export const Route = createFileRoute("/confirmar-email/$token")({ component: ConfirmEmailPage });

function ConfirmEmailPage() {
  const { token } = Route.useParams();
  const confirmFn = useServerFn(confirmEmailChange);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => { void confirmFn({ data: { token } }).then(setResult).catch(() => setResult({ ok: false, message: "Não foi possível confirmar o e-mail." })); }, [confirmFn, token]);
  return <main className="flex min-h-screen items-center justify-center px-4"><Card className="w-full max-w-md"><CardHeader><CardTitle>Confirmação de e-mail</CardTitle><CardDescription>{result?.message ?? "Validando seu link seguro…"}</CardDescription></CardHeader><CardContent>{result ? <Button asChild className="w-full"><Link to="/entrar">Ir para o login</Link></Button> : <Loader2 className="mx-auto size-6 animate-spin" />}</CardContent></Card></main>;
}
