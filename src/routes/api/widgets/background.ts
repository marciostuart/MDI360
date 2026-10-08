import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { widgetConfigSchema, type WidgetConfig } from "@/lib/widgets/catalog";

const MAX_BYTES = 40 * 1024 * 1024;

function targetFor(config: WidgetConfig, scope: string): { target: Record<string, unknown> } | null {
  if (scope === "theme") {
    if (!config.theme) config.theme = {} as NonNullable<WidgetConfig["theme"]>;
    return { target: config.theme as unknown as Record<string, unknown> };
  }
  const lotteryBlockMatch = /^lottery:([^:]+):block:(.+)$/.exec(scope);
  if (lotteryBlockMatch) {
    if (config.type !== "lottery") return null;
    const [, gameId, blockId] = lotteryBlockMatch;
    if (!config.gameIds.includes(gameId as (typeof config.gameIds)[number])) return null;
    config.gameLayouts ??= {};
    config.gameLayouts[gameId] ??= {};
    config.gameLayouts[gameId][blockId] ??= {};
    return { target: config.gameLayouts[gameId][blockId] as Record<string, unknown> };
  }
  if (scope.startsWith("block:")) {
    const blockId = scope.slice("block:".length);
    if (!blockId) return null;
    config.layout ??= {};
    config.layout[blockId] ??= {};
    return { target: config.layout[blockId] as Record<string, unknown> };
  }
  if (config.type !== "lottery" || !scope.startsWith("lottery:")) return null;
  const gameId = scope.slice("lottery:".length);
  if (!gameId || !config.gameIds.includes(gameId as (typeof config.gameIds)[number])) return null;
  config.gameThemes ??= {};
  config.gameThemes[gameId] ??= {};
  return { target: config.gameThemes[gameId] as Record<string, unknown> };
}

export const Route = createFileRoute("/api/widgets/background")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireUser } = await import("@/lib/auth/session.server");
        let user;
        try {
          user = await requireUser();
        } catch {
          return Response.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
        }

        const form = await request.formData();
        const assetId = String(form.get("assetId") ?? "");
        const scope = String(form.get("scope") ?? "");
        const remove = String(form.get("remove") ?? "") === "1";
        const file = form.get("file");
        if (!assetId || !scope || (!(file instanceof File) && !remove)) {
          return Response.json({ error: "Envio inválido." }, { status: 400 });
        }
        if (file instanceof File && file.size > MAX_BYTES) {
          return Response.json({ error: "A imagem excede o limite de 40 MB." }, { status: 413 });
        }

        const { getDb, schema } = await import("@/lib/db/index.server");
        const db = getDb();
        const [row] = await db
          .select({ widgetConfig: schema.mediaAssets.widgetConfig, kind: schema.mediaAssets.kind })
          .from(schema.mediaAssets)
          .where(
            and(
              eq(schema.mediaAssets.id, assetId),
              eq(schema.mediaAssets.organizationId, user.organizationId),
              eq(schema.mediaAssets.kind, "widget"),
            ),
          )
          .limit(1);
        if (!row) return Response.json({ error: "Widget não encontrado." }, { status: 404 });

        const parsed = widgetConfigSchema.safeParse(row.widgetConfig);
        if (!parsed.success) return Response.json({ error: "Configuração do widget inválida." }, { status: 409 });
        const config = JSON.parse(JSON.stringify(parsed.data)) as WidgetConfig;
        const selected = targetFor(config, scope);
        if (!selected) return Response.json({ error: "Destino da imagem inválido." }, { status: 400 });

        const oldKey = typeof selected.target.backgroundImageKey === "string"
          ? selected.target.backgroundImageKey
          : "";
        let newKey = "";
        let url = "";
        if (!remove) {
          const bytes = new Uint8Array(await (file as File).arrayBuffer());
          const isWebp = bytes.length >= 16 &&
            String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
          if (!isWebp) return Response.json({ error: "A imagem precisa ser processada em WebP." }, { status: 415 });

          newKey = `org/${user.organizationId}/widgets/${assetId}/${scope.replace(/[^a-zA-Z0-9_-]+/g, "-")}-${randomUUID()}.webp`;
          const { putObject, createDownloadUrl } = await import("@/lib/storage.server");
          await putObject(newKey, bytes as Uint8Array<ArrayBuffer>, "image/webp");
          url = await createDownloadUrl(newKey, 900);
          selected.target.backgroundImageKey = newKey;
          selected.target.backgroundImageUrl = "";
        } else {
          selected.target.backgroundImageKey = "";
          selected.target.backgroundImageUrl = "";
        }

        const checked = widgetConfigSchema.parse(config);
        await db
          .update(schema.mediaAssets)
          .set({ widgetConfig: checked })
          .where(and(eq(schema.mediaAssets.id, assetId), eq(schema.mediaAssets.organizationId, user.organizationId)));

        if (oldKey && oldKey !== newKey) {
          const { deleteObject, isStorageConfigured } = await import("@/lib/storage.server");
          if (isStorageConfigured()) await deleteObject(oldKey).catch((error) => console.error("widget background delete failed", error));
        }
        const { notifyOrganization } = await import("@/lib/player/realtime.server");
        notifyOrganization(user.organizationId);
        return Response.json({ ok: true, key: newKey, url });
      },
    },
  },
});
