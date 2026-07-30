import { createFileRoute } from "@tanstack/react-router";

import { MediaLibrary } from "@/components/media/media-library";

export const Route = createFileRoute("/studio/conteudos")({
  head: () => ({
    meta: [
      { title: "Conteúdos | MDI 360" },
      {
        name: "description",
        content: "Envie imagens e vídeos para o seu armazenamento MinIO e organize sua biblioteca.",
      },
      { property: "og:title", content: "Biblioteca de conteúdos | MDI 360" },
      {
        property: "og:description",
        content: "Envie imagens e vídeos e organize sua biblioteca de mídias.",
      },
    ],
  }),
  component: MediaLibrary,
});