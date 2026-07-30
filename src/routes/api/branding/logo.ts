import { createFileRoute } from "@tanstack/react-router";

const MAX_LOGO_BYTES = 1_000_000;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/**
 * Uploads the whitelabel logo of the caller's organization. Authenticated by
 * the session cookie and always scoped to that organization's storage prefix.
 */
export const Route = createFileRoute("/api/branding/logo")({
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
        const file = form.get("file");
        if (!(file instanceof File)) {
          return Response.json({ error: "Envio inválido." }, { status: 400 });
        }
        if (!ALLOWED.includes(file.type)) {
          return Response.json({ error: "Use PNG, JPG, WEBP ou SVG." }, { status: 400 });
        }
        if (file.size > MAX_LOGO_BYTES) {
          return Response.json({ error: "A logo deve ter até 1 MB." }, { status: 400 });
        }

        const extension =
          file.type === "image/png"
            ? "png"
            : file.type === "image/jpeg"
              ? "jpg"
              : file.type === "image/webp"
                ? "webp"
                : "svg";
        const key = `branding/${user.organizationId}/logo-${Date.now()}.${extension}`;

        try {
          const { putObject } = await import("@/lib/storage.server");
          await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type);
        } catch (error) {
          console.error("[branding/logo] upload failed", error);
          return Response.json({ error: "Não foi possível enviar a logo." }, { status: 502 });
        }

        const { getDb, schema } = await import("@/lib/db/index.server");
        const { eq } = await import("drizzle-orm");
        await getDb()
          .update(schema.organizations)
          .set({ brandLogoKey: key })
          .where(eq(schema.organizations.id, user.organizationId));

        return Response.json({ ok: true });
      },
    },
  },
});