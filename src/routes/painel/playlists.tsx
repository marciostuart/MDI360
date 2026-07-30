import { createFileRoute } from "@tanstack/react-router";
import { ListVideo } from "lucide-react";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/painel/playlists")({
  head: () => ({
    meta: [
      { title: "Playlists | SinalDigital" },
      {
        name: "description",
        content: "Monte sequências de conteúdos com tempo de exibição e ordem personalizada.",
      },
      { property: "og:title", content: "Playlists de exibição | SinalDigital" },
      {
        property: "og:description",
        content: "Monte sequências de conteúdos com tempo e ordem personalizada.",
      },
    ],
  }),
  component: () => (
    <ModulePlaceholder
      icon={ListVideo}
      title="Playlists"
      description="Uma playlist é a sequência do que aparece na tela: cada item tem uma duração e uma posição na fila."
      comingUp={[
        "Arrastar e soltar para reordenar",
        "Duração por item",
        "Publicar a playlist em uma ou várias telas",
      ]}
    />
  ),
});