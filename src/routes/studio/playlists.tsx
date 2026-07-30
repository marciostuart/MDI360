import { createFileRoute } from "@tanstack/react-router";

import { PlaylistManager } from "@/components/playlists/playlist-manager";

export const Route = createFileRoute("/studio/playlists")({
  head: () => ({
    meta: [
      { title: "Playlists | MDI 360" },
      {
        name: "description",
        content: "Monte sequências de conteúdos com tempo de exibição e ordem personalizada.",
      },
      { property: "og:title", content: "Playlists de exibição | MDI 360" },
      {
        property: "og:description",
        content: "Monte sequências de conteúdos com tempo e ordem personalizada.",
      },
    ],
  }),
  component: PlaylistsPage,
});

function PlaylistsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Playlists</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Uma playlist é a sequência do que aparece na tela: cada item tem uma duração e uma
          posição na fila. Depois basta programá-la na Agenda.
        </p>
      </div>
      <PlaylistManager />
    </div>
  );
}