import { createFileRoute } from "@tanstack/react-router";
import { Smartphone } from "lucide-react";

import { InstallGuide } from "@/components/downloads/install-guide";
import { fetchAppDownloadsContent } from "@/lib/downloads/app-content.functions";

export const Route = createFileRoute("/studio/instalar/android")({
  loader: () => fetchAppDownloadsContent(),
  head: () => ({ meta: [{ title: "Instalar Player Android | MDI 360" }] }),
  component: AndroidGuide,
});

function AndroidGuide() {
  const app = Route.useLoaderData().apps.android;
  return (
    <InstallGuide
      title={app.title}
      description={app.pageDescription}
      icon={<Smartphone className="size-6" />}
      downloads={app.downloads}
      downloadDescription={app.downloadDescription}
      steps={app.steps}
      notes={app.notes}
    />
  );
}
