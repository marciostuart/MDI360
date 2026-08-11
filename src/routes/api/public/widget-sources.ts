import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/widget-sources")({
  server: {
    handlers: {
      GET: async () => {
        const { getPublicNewsSources } = await import("@/lib/widgets/data-sources.server");
        const news = (await getPublicNewsSources())
          .filter((source) => source.enabled)
          .map(({ id, label, credit }) => ({ id, label, credit }));
        return Response.json({ news }, { headers: { "cache-control": "public, max-age=60" } });
      },
    },
  },
});
