import { createFileRoute } from "@tanstack/react-router";
import { Tv2 } from "lucide-react";

import { InstallGuide } from "@/components/downloads/install-guide";
import { fetchAppDownloadsContent } from "@/lib/downloads/app-content.functions";

export const Route = createFileRoute("/studio/instalar/roku")({
  loader: () => fetchAppDownloadsContent(),
  head: () => ({ meta: [{ title: "Instalar Canal Roku | MDI 360" }] }),
  component: RokuGuide,
});

function RokuGuide() {
  const app = Route.useLoaderData().apps.roku;
  return (
    <InstallGuide
      title={app.title}
      description={app.pageDescription}
      icon={<Tv2 className="size-6" />}
      downloads={app.downloads}
      downloadDescription={app.downloadDescription}
      steps={app.steps}
      notes={app.notes}
    />
  );
}
