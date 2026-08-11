import { createFileRoute } from "@tanstack/react-router";
import { Laptop } from "lucide-react";

import { InstallGuide } from "@/components/downloads/install-guide";
import { fetchAppDownloadsContent } from "@/lib/downloads/app-content.functions";

export const Route = createFileRoute("/studio/instalar/emissor-linux")({
  loader: () => fetchAppDownloadsContent(),
  head: () => ({ meta: [{ title: "Instalar Emissor MiniOS Linux | MDI 360" }] }),
  component: LinuxGuide,
});

function LinuxGuide() {
  const app = Route.useLoaderData().apps.linux;
  return (
    <InstallGuide
      title={app.title}
      description={app.pageDescription}
      icon={<Laptop className="size-6" />}
      downloads={app.downloads}
      downloadDescription={app.downloadDescription}
      steps={app.steps}
      notes={app.notes}
    />
  );
}
