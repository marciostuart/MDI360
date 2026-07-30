import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ExternalLink, MonitorPlay } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PUBLIC_SITE_URL, APP_NAME } from "@/lib/site-config";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${APP_NAME} — Acesso ao sistema` },
      {
        name: "description",
        content: "Área de acesso ao sistema de mídia digital indoor MDI 360.",
      },
      { property: "og:title", content: `${APP_NAME} — Acesso ao sistema` },
      {
        property: "og:description",
        content: "Área de acesso ao sistema de mídia digital indoor MDI 360.",
      },
    ],
  }),
  component: GatewayPage,
});

function GatewayPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
          <MonitorPlay className="size-6" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Plataforma de mídia digital indoor. Acesse sua conta para gerenciar telas, conteúdos e
          playlists.
        </p>

        <div className="mt-7 flex flex-col gap-2">
          <Button asChild size="lg">
            <Link to="/entrar">
              Entrar no Studio
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <a href={PUBLIC_SITE_URL} target="_blank" rel="noopener noreferrer">
              Conhecer a solução
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
