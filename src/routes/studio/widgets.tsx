import { createFileRoute } from "@tanstack/react-router";

import { WidgetsManager } from "@/components/widgets/widgets-manager";

export const Route = createFileRoute("/studio/widgets")({
  head: () => ({
    meta: [
      { title: "Widgets | MDI 360" },
      {
        name: "description",
        content: "Crie relógios e widgets de clima e use os conteúdos liberados pela plataforma.",
      },
      { property: "og:title", content: "Widgets de informação | MDI 360" },
      {
        property: "og:description",
        content: "Widgets locais e globais prontos para suas playlists.",
      },
    ],
  }),
  component: WidgetsManager,
});
