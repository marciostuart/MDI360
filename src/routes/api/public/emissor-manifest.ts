import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Manifest PWA do terminal emissor. É gerado por token para que o app
 * instalado abra direto na tela de emissão daquele painel.
 */
const querySchema = z.object({
  token: z.string().trim().min(8).max(128),
});

export const Route = createFileRoute("/api/public/emissor-manifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = querySchema.safeParse({ token: url.searchParams.get("token") ?? "" });
        if (!parsed.success) return new Response("Parâmetros inválidos", { status: 400 });

        const startUrl = `/emitir/${encodeURIComponent(parsed.data.token)}`;
        const manifest = {
          id: startUrl,
          name: "Emissor de Senhas · MDI 360",
          short_name: "Senhas",
          description: "Terminal de emissão de senhas normais e preferenciais.",
          start_url: startUrl,
          scope: startUrl,
          display: "fullscreen",
          display_override: ["fullscreen", "standalone"],
          orientation: "any",
          background_color: "#0b1220",
          theme_color: "#0b1220",
          icons: [
            { src: "/emissor-icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/emissor-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/emissor-icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        };

        return new Response(JSON.stringify(manifest), {
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});