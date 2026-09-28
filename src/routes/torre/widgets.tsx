import { createFileRoute } from "@tanstack/react-router";

import { PlatformWidgetsManager } from "@/components/admin/platform-widgets-manager";

export const Route = createFileRoute("/torre/widgets")({
  head: () => ({
    meta: [
      { title: "Widgets globais | Torre MDI 360" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PlatformWidgetsManager,
});
