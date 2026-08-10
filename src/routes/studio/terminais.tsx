import { createFileRoute } from "@tanstack/react-router";

import { TerminalManager } from "@/components/devices/terminal-manager";

export const Route = createFileRoute("/studio/terminais")({
  head: () => ({
    meta: [
      { title: "Terminais | MDI 360" },
      {
        name: "description",
        content: "Vincule e configure terminais Android, Roku e navegador no MDI 360.",
      },
    ],
  }),
  component: TerminalManager,
});
