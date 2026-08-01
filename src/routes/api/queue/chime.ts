import { createFileRoute } from "@tanstack/react-router";

const MAX_CHIME_BYTES = 2 * 1024 * 1024;

/**
 * Upload of a custom call tone (MP3/WAV) for one screen's queue panel. The file
 * is small and never enters the media library, so it does not consume the plan
 * storage quota — it replaces the previous tone of the same panel.
 */
export const Route = createFileRoute("/api/queue/chime")({
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

        const declared = Number(request.headers.get("content-length") ?? 0);
        if (declared > MAX_CHIME_BYTES + 512 * 1024) {
          return Response.json({ error: "O tom de chamada deve ter até 2 MB." }, { status: 413 });
        }

        const form = await request.formData();
        const deviceId = String(form.get("deviceId") ?? "");
        const file = form.get("file");
        if (!/^[0-9a-f-]{36}$/i.test(deviceId) || !(file instanceof File)) {
          return Response.json({ error: "Envio inválido." }, { status: 400 });
        }
        if (file.size > MAX_CHIME_BYTES) {
          return Response.json({ error: "O tom de chamada deve ter até 2 MB." }, { status: 413 });
        }
        // Alguns navegadores/TVs enviam o arquivo sem MIME: nesse caso vale a extensão.
        const declaredType = (file.type || "").toLowerCase();
        const nameExt = (file.name.split(".").pop() ?? "").toLowerCase();
        const extension =
          nameExt === "wav" || nameExt === "ogg" || nameExt === "mp3"
            ? nameExt
            : declaredType.includes("wav")
              ? "wav"
              : declaredType.includes("ogg")
                ? "ogg"
                : declaredType.includes("mpeg") || declaredType.includes("mp3")
                  ? "mp3"
                  : "";
        if (!extension) {
          return Response.json({ error: "Envie um arquivo .mp3, .wav ou .ogg." }, { status: 415 });
        }
        const type =
          extension === "wav" ? "audio/wav" : extension === "ogg" ? "audio/ogg" : "audio/mpeg";
        if (file.size === 0) {
          return Response.json({ error: "O arquivo enviado está vazio." }, { status: 400 });
        }

        const { getDb, schema, isDatabaseConfigured } = await import("@/lib/db/index.server");
        if (!isDatabaseConfigured()) {
          return Response.json({ error: "Banco de dados não configurado." }, { status: 503 });
        }
        const { and, eq } = await import("drizzle-orm");
        const db = getDb();

        const panels = await db
          .select({ id: schema.queuePanels.id, key: schema.queuePanels.chimeStorageKey })
          .from(schema.queuePanels)
          .where(
            and(
              eq(schema.queuePanels.deviceId, deviceId),
              eq(schema.queuePanels.organizationId, user.organizationId),
            ),
          )
          .limit(1);
        const panel = panels[0];
        if (!panel) {
          return Response.json({ error: "Painel de senhas não encontrado." }, { status: 404 });
        }

        const { putObject, deleteObject, isStorageConfigured } = await import(
          "@/lib/storage.server"
        );
        if (!isStorageConfigured()) {
          return Response.json({ error: "Armazenamento não configurado." }, { status: 503 });
        }

        const key = `org/${user.organizationId}/queue-chimes/${panel.id}-${Date.now()}.${extension}`;

        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          await putObject(key, bytes as Uint8Array<ArrayBuffer>, type);
        } catch (error) {
          console.error("queue chime upload failed", error);
          return Response.json(
            { error: "Não foi possível salvar o tom de chamada. Tente novamente." },
            { status: 502 },
          );
        }

        await db
          .update(schema.queuePanels)
          .set({ chimeStorageKey: key, chimeName: file.name.slice(0, 120) })
          .where(eq(schema.queuePanels.id, panel.id));

        // Substituição: o tom anterior sai do MinIO para não acumular lixo.
        if (panel.key && panel.key !== key) {
          try {
            await deleteObject(panel.key);
          } catch {
            // tom anterior pode já não existir — ignorado
          }
        }

        const { notifyDevice } = await import("@/lib/player/realtime.server");
        notifyDevice(deviceId);

        return Response.json({ ok: true, name: file.name });
      },
    },
  },
});
