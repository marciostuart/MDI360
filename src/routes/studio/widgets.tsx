import { createFileRoute } from "@tanstack/react-router";

import { WidgetsManager } from "@/components/widgets/widgets-manager";

export const Route = createFileRoute("/studio/widgets")({
  head: () => ({
    meta: [
      { title: "Widgets | MDI 360" },
      {
        name: "description",
        content:
          "Crie e personalize widgets de relógio, clima, cotações e notícias para suas telas.",
      },
      { property: "og:title", content: "Widgets de informação | MDI 360" },
      {
        property: "og:description",
        content: "Relógio, clima, cotações e notícias RSS prontos para suas playlists.",
      },
    ],
  }),
  component: WidgetsManager,
});
