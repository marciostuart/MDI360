import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MonitorPlay } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { signIn, signUp } from "@/lib/auth/auth.functions";
import { useSetupState } from "@/lib/auth/useCurrentUser";

export const Route = createFileRoute("/entrar")({
  head: () => ({
    meta: [
      { title: "Entrar | Painel de Sinalização Digital" },
      {
        name: "description",
        content:
          "Acesse o painel para gerenciar suas telas, playlists e conteúdos de sinalização digital.",
      },
      { property: "og:title", content: "Entrar no Painel de Sinalização Digital" },
      {
        property: "og:description",
        content: "Acesse o painel para gerenciar suas telas e conteúdos.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setup = useSetupState();
  const signInFn = useServerFn(signIn);
  const signUpFn = useServerFn(signUp);

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [signupForm, setSignupForm] = useState({
    name: "",
    organizationName: "",
    email: "",
    password: "",
  });

  async function onSuccess() {
    await queryClient.invalidateQueries({ queryKey: ["current-user"] });
    await queryClient.invalidateQueries({ queryKey: ["setup-state"] });
    navigate({ to: "/studio" });
  }

  const loginMutation = useMutation({
    mutationFn: () => signInFn({ data: loginForm }),
    onSuccess: async (result) => {
      if (result.ok) {
        toast.success("Bem-vindo de volta!");
        await onSuccess();
      } else {
        toast.error(result.message);
      }
    },
    onError: () => toast.error("Verifique os dados informados."),
  });

  const signupMutation = useMutation({
    mutationFn: () => signUpFn({ data: signupForm }),
    onSuccess: async (result) => {
      if (result.ok) {
        toast.success("Conta criada com sucesso!");
        await onSuccess();
      } else {
        toast.error(result.message);
      }
    },
    onError: () => toast.error("Verifique os dados informados."),
  });

  const databaseMissing = setup.data && !setup.data.databaseReady;

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="console-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <MonitorPlay className="size-5" />
          </span>
          <span className="font-display text-lg font-semibold">SinalDigital</span>
        </Link>

        {databaseMissing ? (
          <Card className="mb-4 border-destructive/40 bg-destructive/10">
            <CardContent className="pt-6 text-sm text-foreground">
              O banco de dados ainda não está conectado. Configure a variável{" "}
              <code className="rounded bg-background/60 px-1">DATABASE_URL</code> para liberar o
              login.
            </CardContent>
          </Card>
        ) : null}

        <Card className="signal-glow">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Acesse seu painel</CardTitle>
            <CardDescription>
              Gerencie suas telas, playlists e conteúdos em um só lugar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-6">
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    loginMutation.mutate();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="login-email">E-mail</Label>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={loginForm.email}
                      onChange={(event) =>
                        setLoginForm((form) => ({ ...form, email: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <Input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      required
                      minLength={8}
                      value={loginForm.password}
                      onChange={(event) =>
                        setLoginForm((form) => ({ ...form, password: event.target.value }))
                      }
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                    {loginMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Entrar no painel"
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-6">
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    signupMutation.mutate();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="signup-org">Nome da empresa</Label>
                    <Input
                      id="signup-org"
                      required
                      minLength={2}
                      value={signupForm.organizationName}
                      onChange={(event) =>
                        setSignupForm((form) => ({ ...form, organizationName: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Seu nome</Label>
                    <Input
                      id="signup-name"
                      required
                      minLength={2}
                      autoComplete="name"
                      value={signupForm.name}
                      onChange={(event) =>
                        setSignupForm((form) => ({ ...form, name: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">E-mail</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={signupForm.email}
                      onChange={(event) =>
                        setSignupForm((form) => ({ ...form, email: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Senha</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={signupForm.password}
                      onChange={(event) =>
                        setSignupForm((form) => ({ ...form, password: event.target.value }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">Use no mínimo 8 caracteres.</p>
                  </div>
                  <Button type="submit" className="w-full" disabled={signupMutation.isPending}>
                    {signupMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Criar minha conta"
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}