import { createFileRoute, Link } from "@tanstack/react-router";
import { Laptop, MonitorDown, Smartphone, Tv2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAppDownloadsContent } from "@/lib/downloads/app-content.functions";
import type { AppDownloadId } from "@/lib/downloads/app-content";

export const Route = createFileRoute("/studio/downloads")({
  loader: () => fetchAppDownloadsContent(),
  head: () => ({
    meta: [
      { title: "Aplicativos e downloads | MDI 360" },
      {
        name: "description",
        content:
          "Baixe e instale os aplicativos MDI 360 para Android, Roku, Windows e MiniOS Linux.",
      },
    ],
  }),
  component: DownloadsPage,
});

const APPS: Array<{
  id: AppDownloadId;
  to:
    | "/studio/instalar/android"
    | "/studio/instalar/roku"
    | "/studio/instalar/emissor-windows"
    | "/studio/instalar/emissor-linux";
  icon: typeof Smartphone;
}> = [
  { id: "android", to: "/studio/instalar/android", icon: Smartphone },
  { id: "roku", to: "/studio/instalar/roku", icon: Tv2 },
  { id: "windows", to: "/studio/instalar/emissor-windows", icon: MonitorDown },
  { id: "linux", to: "/studio/instalar/emissor-linux", icon: Laptop },
];

function DownloadsPage() {
  const content = Route.useLoaderData();
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">{content.heading}</h1>
        <p className="text-sm text-muted-foreground">{content.introduction}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {APPS.filter((app) => content.apps[app.id].enabled).map((app) => {
          const appContent = content.apps[app.id];
          const Icon = app.icon;
          return (
            <Card key={app.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  {appContent.title}
                </CardTitle>
                <CardDescription>{appContent.cardDescription}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-5">
                <p className="text-sm text-muted-foreground">{appContent.cardDetail}</p>
                <Button asChild className="w-full">
                  <Link to={app.to}>Ver download e instalação</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-dashed">
        <CardContent className="py-5 text-sm text-muted-foreground">{content.footer}</CardContent>
      </Card>
    </div>
  );
}
