import { createFileRoute } from "@tanstack/react-router";
import { Images } from "lucide-react";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/studio/conteudos")({
  head: () => ({
    meta: [
      { title: "Conteúdos | SinalDigital" },
      {
        name: "description",
        content: "Envie imagens e vídeos para o seu armazenamento MinIO e organize sua biblioteca.",
      },
      { property: "og:title", content: "Biblioteca de conteúdos | SinalDigital" },
      {
        property: "og:description",
        content: "Envie imagens e vídeos e organize sua biblioteca de mídias.",
      },
    ],
  }),
  component: () => (
    <ModulePlaceholder
      icon={Images}
      title="Conteúdos"
      description="Sua biblioteca de mídias. Os arquivos ficam guardados no MinIO da sua VPS, e as telas baixam por links temporários e seguros."
      comingUp={[
        "Upload direto para o MinIO",
        "Miniaturas de imagens e vídeos",
        "Organização por pastas e etiquetas",
      ]}
    />
  ),
});