import { createFileRoute } from "@tanstack/react-router";

import { OrganizationNewsSources } from "@/components/widgets/organization-news-sources";
import { WidgetsManager } from "@/components/widgets/widgets-manager";

export const Route = createFileRoute("/studio/widgets")({
  head: () => ({
    meta: [
      { title: "Widgets | MDI 360" },
      {
        name: "description",
        content: "Crie, personalize e selecione as fontes dos widgets da sua empresa.",
      },
      { property: "og:title", content: "Widgets de informação | MDI 360" },
      {
        property: "og:description",
        content: "Widgets locais, notícias e fontes RSS personalizadas para seus terminais.",
      },
    ],
  }),
  component: WidgetsPage,
});

function WidgetsPage() {
  return (
    <div className="space-y-8">
      <WidgetsManager />
      <OrganizationNewsSources />
    </div>
  );
}