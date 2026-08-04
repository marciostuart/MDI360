import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Tv } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { fetchStudioOverview } from "@/lib/studio/overview.functions";

export const Route = createFileRoute("/studio/")({
  head: () => ({
    meta: [
      { title: "Visão geral | MDI 360" },
      {
        name: "description",
        content: "Acompanhe o status das suas telas, conteúdos publicados e programações.",
      },
      { property: "og:title", content: "Visão geral do painel MDI 360" },
      {
        property: "og:description",
        content: "Acompanhe o status das suas telas e conteúdos publicados.",
      },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const { data: user } = useCurrentUser();
  const overviewFn = useServerFn(fetchStudioOverview);
  const { data: stats } = useQuery({
    queryKey: ["studio-overview"],
    queryFn: () => overviewFn({}),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">{user?.organizationName}</p>
        <h1 className="mt-1 text-3xl font-semibold">Visão geral</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Este é o centro de controle das suas telas: acompanhe aqui os aparelhos vinculados, os
          conteúdos publicados, as playlists e a programação.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Telas cadastradas</CardDescription>
            <CardTitle className="text-3xl">{stats?.devices ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <Tv className="mr-1 inline size-3.5" />
            {stats?.devices ? "Aparelhos no seu parque" : "Nenhum aparelho pareado ainda"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Telas online agora</CardDescription>
            <CardTitle className="text-3xl text-signal-online">
              {stats?.devicesOnline ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Checagem automática a cada 30 segundos
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Conteúdos publicados</CardDescription>
            <CardTitle className="text-3xl">{stats?.mediaReady ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Imagens e vídeos no seu armazenamento
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Playlists</CardDescription>
            <CardTitle className="text-3xl">{stats?.playlists ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Sequências prontas para exibição
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Programações ativas</CardDescription>
            <CardTitle className="text-3xl">{stats?.schedules ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Janelas de horário configuradas na Agenda
          </CardContent>
        </Card>
      </div>
    </div>
  );
}