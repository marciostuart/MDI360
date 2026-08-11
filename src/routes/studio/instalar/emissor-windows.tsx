import { createFileRoute } from "@tanstack/react-router";
import { MonitorDown } from "lucide-react";

import { InstallGuide } from "@/components/downloads/install-guide";
import { fetchAppDownloadsContent } from "@/lib/downloads/app-content.functions";

export const Route = createFileRoute("/studio/instalar/emissor-windows")({
  loader: () => fetchAppDownloadsContent(),
  head: () => ({ meta: [{ title: "Instalar Emissor Windows | MDI 360" }] }),
  component: WindowsGuide,
});

function WindowsGuide() {
  const app = Route.useLoaderData().apps.windows;
  return (
    <InstallGuide
      title={app.title}
      description={app.pageDescription}
      icon={<MonitorDown className="size-6" />}
      downloads={app.downloads}
      downloadDescription={app.downloadDescription}
      steps={app.steps}
      notes={app.notes}
    />
  );
}
