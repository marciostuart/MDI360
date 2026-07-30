import { createFileRoute } from "@tanstack/react-router";
import { Tv } from "lucide-react";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/studio/telas")({
  head: () => ({
    meta: [
      { title: "Telas | SinalDigital" },
      {
        name: "description",
        content: "Pareie aparelhos Android, monitore o status das telas e envie comandos remotos.",
      },
      { property: "og:title", content: "Gerenciamento de telas | SinalDigital" },
      {
        property: "og:description",
        content: "Pareie aparelhos, monitore telas e envie comandos remotos.",
      },
    ],
  }),
  component: () => (
    <ModulePlaceholder
      icon={Tv}
      title="Telas"
      description="Aqui você cadastra cada TV, pareia o aplicativo com um código de 6 dígitos e acompanha se a tela está online."
      comingUp={[
        "Pareamento por código exibido na TV",
        "Status online/offline em tempo real",
        "Comandos remotos: reiniciar, atualizar, print da tela",
      ]}
    />
  ),
});