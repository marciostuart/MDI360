import { createFileRoute } from "@tanstack/react-router";

import { DeviceManager } from "@/components/devices/device-manager";

export const Route = createFileRoute("/studio/telas")({
  head: () => ({
    meta: [
      { title: "Telas | MDI 360" },
      {
        name: "description",
        content: "Pareie aparelhos Android, monitore o status das telas e envie comandos remotos.",
      },
      { property: "og:title", content: "Gerenciamento de telas | MDI 360" },
      {
        property: "og:description",
        content: "Pareie aparelhos, monitore telas e envie comandos remotos.",
      },
    ],
  }),
  component: DeviceManager,
});