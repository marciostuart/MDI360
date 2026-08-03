import { createFileRoute, Link } from "@tanstack/react-router";
import { Laptop, MonitorDown, Smartphone, Tv2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/studio/downloads")({
  head: () => ({
    meta: [
      { title: "Aplicativos e downloads | MDI 360" },
      {
        name: "description",
        content: "Baixe e instale os aplicativos MDI 360 para Android, Roku, Windows e MiniOS Linux.",
      },
    ],
  }),
  component: DownloadsPage,
});

const apps = [
  {
    title: "Player Android",
    description: "Para TV Box, Smart TV Android, tablet e celular.",
    detail: "APK com inicialização automática, cache offline e código de ativação.",
    to: "/studio/instalar/android" as const,
    icon: Smartphone,
  },
  {
    title: "Canal Roku",
    description: "Para aparelhos e TVs com sistema Roku.",
    detail: "Canal instalado pelo modo desenvolvedor, com player e ativação nativos.",
    to: "/studio/instalar/roku" as const,
    icon: Tv2,
  },
  {
    title: "Emissor Windows",
    description: "Totem de senhas e impressão térmica no Windows.",
    detail: "Tela cheia, impressão automática e inicialização junto com o computador.",
    to: "/studio/instalar/emissor-windows" as const,
    icon: MonitorDown,
  },
  {
    title: "Emissor MiniOS / Linux",
    description: "Totem de senhas e impressão térmica no MiniOS.",
    detail: "Pacotes DEB e AppImage para Linux Debian x64, com autostart e CUPS.",
    to: "/studio/instalar/emissor-linux" as const,
    icon: Laptop,
  },
];

function DownloadsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">Aplicativos e downloads</h1>
        <p className="text-sm text-muted-foreground">
          Escolha o aparelho para acessar o download e o passo a passo completo de instalação.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {apps.map((app) => {
          const Icon = app.icon;
          return (
            <Card key={app.title} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  {app.title}
                </CardTitle>
                <CardDescription>{app.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-5">
                <p className="text-sm text-muted-foreground">{app.detail}</p>
                <Button asChild className="w-full">
                  <Link to={app.to}>Ver download e instalação</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-dashed">
        <CardContent className="py-5 text-sm text-muted-foreground">
          Sem um aplicativo instalado, o player também funciona em um navegador abrindo{" "}
          <a className="font-medium text-primary" href="/tela" target="_blank" rel="noreferrer">
            /tela
          </a>
          . Para o emissor de senhas, use <strong>/emitir</strong>.
        </CardContent>
      </Card>
    </div>
  );
}
