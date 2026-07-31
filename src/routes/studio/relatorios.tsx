import { createFileRoute } from "@tanstack/react-router";

import { PlaybackReports } from "@/components/reports/playback-reports";

export const Route = createFileRoute("/studio/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios de exibição | MDI 360" },
      {
        name: "description",
        content:
          "Acompanhe em tempo real o que cada TV exibe e veja relatórios por tela, playlist e arquivo.",
      },
      { property: "og:title", content: "Relatórios de exibição | MDI 360" },
      {
        property: "og:description",
        content: "Exibições por tela, playlist e arquivo, com monitoramento ao vivo das TVs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Relatórios</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Veja o que está no ar em cada tela agora e quanto cada playlist e arquivo foi exibido no
          período escolhido.
        </p>
      </div>
      <PlaybackReports />
    </div>
  );
}
