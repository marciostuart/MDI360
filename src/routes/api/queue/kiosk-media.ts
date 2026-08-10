import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 8 * 1024 * 1024;
const SLOTS = new Set(["logo", "background", "call-background"]);

async function requirePanel(request: Request, deviceId: string) {
  const { requireUser } = await import("@/lib/auth/session.server");
  const user = await requireUser();
  const { getDb, schema } = await import("@/lib/db/index.server");
  const { and, eq } = await import("drizzle-orm");
  const rows = await getDb()
    .select({
      id: schema.queuePanels.id,
      logoKey: schema.queuePanels.kioskLogoKey,
      bgKey: schema.queuePanels.kioskBgImageKey,
      callBgKey: schema.queuePanels.themeBgImageKey,
    })
    .from(schema.queuePanels)
    .innerJoin(
      schema.queuePanelDevices,
      eq(schema.queuePanelDevices.panelId, schema.queuePanels.id),
    )
    .where(
      and(
        eq(schema.queuePanelDevices.deviceId, deviceId),
        eq(schema.queuePanels.organizationId, user.organizationId),
      ),
    )
    .limit(1);
  return { user, db: getDb(), schema, panel: rows[0] };
}

export const Route = createFileRoute("/api/queue/kiosk-media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const form = await request.formData();
          const deviceId = String(form.get("deviceId") ?? "");
          const slot = String(form.get("slot") ?? "");
          const file = form.get("file");
          if (!deviceId || !SLOTS.has(slot) || !(file instanceof File)) {
            return Response.json({ error: "Envio invÃ¡lido." }, { status: 400 });
          }
          if (file.type !== "image/webp" || file.size > MAX_BYTES) {
            return Response.json(
              { error: "A imagem deve ser WebP e ter atÃ© 8 MB." },
              { status: 400 },
            );
          }
          const { db, schema, panel, user } = await requirePanel(request, deviceId);
          if (!panel) return Response.json({ error: "Terminal nÃ£o encontrado." }, { status: 404 });
          const key = `org/${user.organizationId}/queue/${panel.id}/${slot}-${Date.now()}.webp`;
          const { putObject, deleteObject, isStorageConfigured } =
            await import("@/lib/storage.server");
          if (!isStorageConfigured()) {
            return Response.json(
              { error: "Armazenamento de imagens não está configurado." },
              { status: 503 },
            );
          }
          await putObject(key, new Uint8Array(await file.arrayBuffer()), "image/webp");
          const field =
            slot === "logo"
              ? { kioskLogoKey: key }
              : slot === "background"
                ? { kioskBgImageKey: key, kioskBgMediaId: null }
                : { themeBgImageKey: key, themeBgMediaId: null };
          const oldKey =
            slot === "logo"
              ? panel.logoKey
              : slot === "background"
                ? panel.bgKey
                : panel.callBgKey;
          try {
            const { eq } = await import("drizzle-orm");
            await db
              .update(schema.queuePanels)
              .set(field)
              .where(eq(schema.queuePanels.id, panel.id));
          } catch (error) {
            try {
              await deleteObject(key);
            } catch {
              /* best effort cleanup */
            }
            throw error;
          }
          if (oldKey && oldKey !== key) {
            try {
              await deleteObject(oldKey);
            } catch (error) {
              console.warn("[queue/kiosk-media] old object cleanup failed", error);
            }
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error("[queue/kiosk-media] upload failed", error);
          return Response.json({ error: "NÃ£o foi possÃ­vel salvar a imagem." }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const body = (await request.json()) as { deviceId?: string; slot?: string };
          if (!body.deviceId || !body.slot || !SLOTS.has(body.slot)) {
            return Response.json({ error: "SolicitaÃ§Ã£o invÃ¡lida." }, { status: 400 });
          }
          const { db, schema, panel } = await requirePanel(request, body.deviceId);
          if (!panel) return Response.json({ error: "Terminal nÃ£o encontrado." }, { status: 404 });
          const oldKey =
            body.slot === "logo"
              ? panel.logoKey
              : body.slot === "background"
                ? panel.bgKey
                : panel.callBgKey;
          const field =
            body.slot === "logo"
              ? { kioskLogoKey: null }
              : body.slot === "background"
                ? { kioskBgImageKey: null }
                : { themeBgImageKey: null, themeBgMediaId: null };
          await db
            .update(schema.queuePanels)
            .set(field)
            .where((await import("drizzle-orm")).eq(schema.queuePanels.id, panel.id));
          if (oldKey) {
            const { deleteObject } = await import("@/lib/storage.server");
            await deleteObject(oldKey);
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error("[queue/kiosk-media] delete failed", error);
          return Response.json({ error: "NÃ£o foi possÃ­vel remover a imagem." }, { status: 500 });
        }
      },
    },
  },
});
