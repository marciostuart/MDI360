import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { CANVAS_PRESET_IDS } from "./presets";

const streamSchema = z.object({
  url: z.string().trim().min(5, "Informe o endereço do conteúdo").max(600),
  name: z.string().trim().max(160).optional(),
  /** Tempo de exibição na rotação (lives e rádios não têm fim). */
  durationSeconds: z.number().int().min(5).max(3600).default(60),
  canvasPreset: z.enum(CANVAS_PRESET_IDS as [string, ...string[]]),
});

/**
 * Adiciona um conteúdo por streaming à biblioteca: vídeo do YouTube, uma live
 * (YouTube ao vivo, HLS) ou uma rádio online.
 *
 * Nada é baixado: o endereço é guardado e a TV abre o stream no momento da
 * exibição. Por isso não consome a cota de armazenamento nem fica em cache no
 * aparelho — o que também é o comportamento correto para conteúdo ao vivo.
 */
export const addStreamAsset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => streamSchema.parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema, isDatabaseConfigured } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) throw new Error("Banco de dados não configurado.");

    const { requireUser } = await import("@/lib/auth/session.server");
    const user = await requireUser();

    const { getOrgLimits } = await import("@/lib/admin/limits.server");
    const limits = await getOrgLimits(user.organizationId);
    if (limits.expired || limits.subscriptionStatus === "suspended") {
      throw new Error("Assinatura inativa. Fale com o suporte para reativar sua conta.");
    }

    const { normalizeStreamUrl } = await import("./stream-url");
    const parsed = normalizeStreamUrl(data.url);
    if (!parsed) {
      throw new Error("Endereço inválido. Cole o link do vídeo, da live ou da rádio.");
    }

    const fallbackName = parsed.youtubeId ? "Vídeo do YouTube" : hostOf(parsed.url);
    const name = (data.name?.trim() || fallbackName).slice(0, 160);

    const inserted = await getDb()
      .insert(schema.mediaAssets)
      .values({
        organizationId: user.organizationId,
        name,
        kind: "stream",
        // Não há arquivo para otimizar: já entra disponível para as playlists.
        status: "ready",
        canvasPreset: data.canvasPreset,
        sourceUrl: parsed.url,
        byteSize: 0,
        durationMs: data.durationSeconds * 1000,
        createdBy: user.id,
      })
      .returning({ id: schema.mediaAssets.id });

    return { assetId: inserted[0]?.id ?? "", name };
  });

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Transmissão";
  }
}
